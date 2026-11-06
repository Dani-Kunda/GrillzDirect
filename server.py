"""
Grillz Direct — web server (Python standard library only, nothing to install).

Run:   python server.py
Open:  http://localhost:8000

Serves the website and handles:
  POST /api/contact         -> saves contact-form messages to data/messages.json
  POST /api/checkout        -> works out the 50% deposit and opens a Stripe Checkout
                               page (card, Apple Pay, Google Pay or PayPal)
  GET  /api/confirm         -> checks a finished Stripe payment for the thank-you page
  POST /api/stripe-webhook  -> Stripe tells us a payment went through (optional)

Payment settings live in a file called .env next to this one (see .env.example):
  STRIPE_SECRET_KEY      sk_test_... while testing, sk_live_... when you go live
  STRIPE_WEBHOOK_SECRET  whsec_...   (optional, from Stripe > Developers > Webhooks)
  SITE_URL               https://your-domain.com  (optional, used for return links)
"""

import base64
import hashlib
import hmac
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
PORT = int(os.environ.get("PORT", 8000))
MAX_BODY = 20_000          # bytes, for our own forms
MAX_WEBHOOK_BODY = 1_000_000
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SESSION_RE = re.compile(r"^cs_[A-Za-z0-9_]+$")
_lock = threading.Lock()

# Newbie price list per arch — keep in sync with PRICE_TIERS in js/main.js
PRICE_TIERS = [(1, 40, 35), (2, 60, 50), (4, 90, 75), (6, 120, 100), (8, 150, 125)]
FULL_PRICE = {"EUR": 200, "GBP": 170}
DEPOSIT_RATE = 0.5
MAX_TEETH_PER_ARCH = 10
METALS = {"silver": "Silver", "gold": "Gold", "rose": "Rose gold"}
STYLES = {"Plain polish", "Open face", "Diamond cut"}
# Apple Pay and Google Pay are wallets on top of "card" in Stripe Checkout
STRIPE_METHODS = {"apple": "card", "google": "card", "card": "card", "paypal": "paypal"}


def load_env():
    """Read KEY=VALUE lines from .env (real environment variables win)."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text("utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()
STRIPE_KEY = os.environ.get("STRIPE_SECRET_KEY", "")
WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
SITE_URL = os.environ.get("SITE_URL", "").rstrip("/")


# ---------- storage ----------

def append_record(filename, record):
    """Append a record to a JSON list file in data/."""
    DATA.mkdir(exist_ok=True)
    path = DATA / filename
    with _lock:
        records = json.loads(path.read_text("utf-8")) if path.exists() else []
        records.append(record)
        path.write_text(json.dumps(records, indent=2, ensure_ascii=False), "utf-8")


def update_order(reference, **fields):
    path = DATA / "orders.json"
    with _lock:
        if not path.exists():
            return
        records = json.loads(path.read_text("utf-8"))
        for r in records:
            if r.get("reference") == reference:
                r.update(fields)
        path.write_text(json.dumps(records, indent=2, ensure_ascii=False), "utf-8")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------- pricing ----------

def arch_price(teeth, currency):
    if teeth <= 0:
        return 0
    column = 1 if currency == "EUR" else 2
    for tier in PRICE_TIERS:
        if teeth <= tier[0]:
            return tier[column]
    return FULL_PRICE[currency]


def price_order(items, currency):
    """Validate the basket and price it ourselves — never trust browser prices."""
    if not isinstance(items, list) or not 0 < len(items) <= 20:
        raise ValueError("Your order is empty.")
    lines, total = [], 0
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Invalid item.")
        top, bottom = item.get("top"), item.get("bottom")
        if not all(isinstance(n, int) and 0 <= n <= MAX_TEETH_PER_ARCH for n in (top, bottom)) or top + bottom == 0:
            raise ValueError("Invalid teeth selection.")
        style = item.get("style", "Plain polish")
        if style not in STYLES:
            raise ValueError("Custom designs need a quote before payment.")
        metal = METALS.get(item.get("metal"), "Silver")
        price = arch_price(top, currency) + arch_price(bottom, currency)
        arches = [f"Top {'full' if top >= 9 else top}" if top else "", f"Bottom {'full' if bottom >= 9 else bottom}" if bottom else ""]
        lines.append({"summary": f"{', '.join(a for a in arches if a)} · {metal} · {style}", "price": price})
        total += price
    return lines, total


# ---------- Stripe (plain HTTPS calls, no extra package needed) ----------

def flatten(params, prefix=""):
    """Turn nested dicts/lists into Stripe's form encoding: a[b][0][c]=..."""
    out = []
    items = params.items() if isinstance(params, dict) else enumerate(params)
    for key, value in items:
        name = f"{prefix}[{key}]" if prefix else str(key)
        if isinstance(value, (dict, list)):
            out.extend(flatten(value, name))
        else:
            out.append((name, str(value).lower() if isinstance(value, bool) else str(value)))
    return out


def stripe_request(method, path, params=None):
    data = urllib.parse.urlencode(flatten(params)).encode() if params else None
    req = urllib.request.Request(f"https://api.stripe.com/v1/{path}", data=data, method=method)
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{STRIPE_KEY}:".encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        try:
            message = json.loads(e.read())["error"]["message"]
        except Exception:
            message = f"Stripe error {e.code}"
        raise RuntimeError(message) from None


def verify_webhook(payload, header):
    """Check the Stripe-Signature header (HMAC-SHA256 of 'timestamp.payload')."""
    parts = dict(p.split("=", 1) for p in header.split(",") if "=" in p)
    signatures = [v for k, v in (p.split("=", 1) for p in header.split(",") if "=" in p) if k == "v1"]
    timestamp = parts.get("t", "0")
    if not timestamp.isdigit() or abs(time.time() - int(timestamp)) > 300:
        return False
    expected = hmac.new(WEBHOOK_SECRET.encode(), f"{timestamp}.".encode() + payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in signatures)


# ---------- HTTP ----------

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # always serve the latest CSS/JS so design changes show up straight away
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def site_url(self):
        return SITE_URL or f"http://{self.headers.get('Host', f'localhost:{PORT}')}"

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self, limit):
        length = int(self.headers.get("Content-Length", 0))
        if length <= 0 or length > limit:
            return None
        return self.rfile.read(length)

    def read_json(self):
        raw = self.read_body(MAX_BODY)
        try:
            return json.loads(raw) if raw else None
        except json.JSONDecodeError:
            return None

    def do_GET(self):
        # keep saved data, keys and code private
        blocked = self.path.startswith(("/data", "/.env")) or self.path.split("?")[0].endswith(".py")
        if blocked:
            return self.send_error(404)
        if self.path.startswith("/api/confirm"):
            return self.confirm()
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/stripe-webhook":
            return self.webhook()

        data = self.read_json()
        if not isinstance(data, dict):
            return self.send_json(400, {"error": "Invalid request"})
        if self.path == "/api/contact":
            return self.contact(data)
        if self.path == "/api/checkout":
            return self.checkout(data)
        return self.send_json(404, {"error": "Not found"})

    # --- contact form ---
    def contact(self, data):
        name = str(data.get("name", "")).strip()[:100]
        email = str(data.get("email", "")).strip()[:200]
        message = str(data.get("message", "")).strip()[:5000]
        if not name or not message or not EMAIL_RE.match(email):
            return self.send_json(400, {"error": "Name, valid email and message are required"})
        append_record("messages.json", {
            "received": now(), "name": name, "email": email,
            "topic": str(data.get("topic", ""))[:100], "message": message,
        })
        print(f"New message from {name} <{email}>")
        return self.send_json(200, {"ok": True})

    # --- start a Stripe Checkout for the deposit ---
    def checkout(self, data):
        currency = data.get("currency")
        method = data.get("method")
        if currency not in FULL_PRICE or method not in STRIPE_METHODS:
            return self.send_json(400, {"error": "Choose a currency and payment method."})
        try:
            lines, total = price_order(data.get("items"), currency)
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        if not STRIPE_KEY:
            return self.send_json(503, {"error": "Online payments aren't switched on yet (no Stripe key set)."})

        deposit_cents = round(total * DEPOSIT_RATE * 100)
        reference = "GD-" + datetime.now().strftime("%y%m%d-%H%M%S")
        summary = " | ".join(line["summary"] for line in lines)[:450]
        site = self.site_url()
        try:
            session = stripe_request("POST", "checkout/sessions", {
                "mode": "payment",
                "payment_method_types": [STRIPE_METHODS[method]],
                "line_items": [{
                    "quantity": 1,
                    "price_data": {
                        "currency": currency.lower(),
                        "unit_amount": deposit_cents,
                        "product_data": {"name": f"50% deposit — Grillz Direct order {reference}", "description": summary},
                    },
                }],
                "shipping_address_collection": {"allowed_countries": ["IE", "GB"]},
                "phone_number_collection": {"enabled": True},
                "client_reference_id": reference,
                "metadata": {"reference": reference, "order_total": f"{total:.2f} {currency}"},
                "payment_intent_data": {"description": f"Grillz Direct {reference} deposit", "metadata": {"reference": reference}},
                "success_url": f"{site}/thank-you.html?session_id={{CHECKOUT_SESSION_ID}}",
                "cancel_url": f"{site}/payment.html?cancelled=1",
            })
        except (RuntimeError, urllib.error.URLError) as e:
            print(f"Stripe checkout failed: {e}")
            return self.send_json(502, {"error": f"Payment provider error: {e}"})

        append_record("orders.json", {
            "reference": reference, "received": now(), "method": method, "currency": currency,
            "items": lines, "total": total, "deposit": deposit_cents / 100,
            "stripe_session": session["id"], "status": "awaiting deposit",
        })
        print(f"Checkout started for {reference} ({currency} {deposit_cents / 100:.2f})")
        return self.send_json(200, {"url": session["url"], "reference": reference})

    # --- thank-you page asks whether the payment went through ---
    def confirm(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        session_id = (query.get("session_id") or [""])[0]
        if not SESSION_RE.match(session_id) or not STRIPE_KEY:
            return self.send_json(400, {"error": "Unknown payment"})
        try:
            s = stripe_request("GET", f"checkout/sessions/{session_id}")
        except (RuntimeError, urllib.error.URLError) as e:
            return self.send_json(502, {"error": str(e)})
        reference = s.get("metadata", {}).get("reference", "")
        paid = s.get("payment_status") == "paid"
        if paid:
            update_order(reference, status="deposit paid", paid_at=now(),
                         customer=s.get("customer_details") or {})
        return self.send_json(200, {
            "paid": paid, "reference": reference,
            "amount": (s.get("amount_total") or 0) / 100,
            "currency": (s.get("currency") or "eur").upper(),
            "email": (s.get("customer_details") or {}).get("email"),
        })

    # --- Stripe calls this when a payment completes, even if the customer closes the tab ---
    def webhook(self):
        payload = self.read_body(MAX_WEBHOOK_BODY)
        if not payload or not WEBHOOK_SECRET or not verify_webhook(payload, self.headers.get("Stripe-Signature", "")):
            return self.send_json(400, {"error": "Invalid signature"})
        event = json.loads(payload)
        if event.get("type") in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
            s = event["data"]["object"]
            if s.get("payment_status") == "paid":
                reference = s.get("metadata", {}).get("reference", "")
                update_order(reference, status="deposit paid", paid_at=now(), customer=s.get("customer_details") or {})
                print(f"Deposit paid for {reference}")
        return self.send_json(200, {"received": True})


if __name__ == "__main__":
    mode = "LIVE" if STRIPE_KEY.startswith("sk_live") else "TEST" if STRIPE_KEY else "OFF (no key in .env)"
    print(f"Grillz Direct running at http://localhost:{PORT}  ·  Stripe payments: {mode}  (Ctrl+C to stop)")
    host = os.environ.get("HOST", "127.0.0.1")
    ThreadingHTTPServer((host, PORT), Handler).serve_forever()
