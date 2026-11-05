/* =========================================================
   GRILLZ DIRECT — shared JavaScript
   theme, header/footer, cart, builder, payment, contact
   ========================================================= */

const EMAIL = "prodmizzdirect@gmail.com";
const INSTAGRAM = "https://www.instagram.com/grillzdirect/";
const DEPOSIT_RATE = 0.5;

// Newbie price list (per arch), from the pricing flyer, in euro (Ireland) and pounds (UK).
// Keep in sync with PRICE_TIERS in server.py — the server is what actually charges.
const PRICE_TIERS = [
  { teeth: 1, EUR: 40, GBP: 35 },
  { teeth: 2, EUR: 60, GBP: 50 },
  { teeth: 4, EUR: 90, GBP: 75 },
  { teeth: 6, EUR: 120, GBP: 100 },
  { teeth: 8, EUR: 150, GBP: 125 },
];
const FULL_PRICE = { EUR: 200, GBP: 170 };
const SYMBOL = { EUR: "€", GBP: "£" };

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
  },
};

const money = (n, cur = "EUR") => SYMBOL[cur] + n.toFixed(n % 1 ? 2 : 0);
const both = (prices) => `${money(prices.EUR, "EUR")} / ${money(prices.GBP, "GBP")}`;

// Preferred currency: saved choice, else £ for UK browsers, else €
function getCurrency() {
  const saved = store.get("gd-currency", null);
  if (saved === "EUR" || saved === "GBP") return saved;
  return /-GB$/i.test(navigator.language || "") ? "GBP" : "EUR";
}
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- icons ---------- */
const ICONS = {
  instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
  light: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
};

/* ---------- theme: auto (device) / light / dark ---------- */
const THEMES = ["auto", "light", "dark"];
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", mode);
  const btn = $("#theme-toggle");
  if (btn) {
    btn.innerHTML = ICONS[mode] + `<span class="theme-label">${mode}</span>`;
    btn.setAttribute("aria-label", `Theme: ${mode === "auto" ? "match device" : mode}. Click to change.`);
  }
}
applyTheme(store.get("gd-theme", "auto"));

/* ---------- header & footer (shared on every page) ---------- */
const PAGES = [
  ["index.html", "Home"],
  ["shop.html", "Pricing"],
  ["custom.html", "Build Yours"],
  ["policy.html", "Policy"],
  ["faq.html", "FAQ & Care"],
  ["contact.html", "Contact"],
];

function renderChrome() {
  const here = location.pathname.split("/").pop() || "index.html";
  const header = $("#site-header");
  if (header) {
    header.className = "site-header";
    header.innerHTML = `
      <nav class="nav container" aria-label="Main">
        <a class="logo" href="index.html" aria-label="Grillz Direct home"></a>
        <ul class="nav-links" id="nav-links">
          ${PAGES.map(([href, label]) => `<li><a href="${href}" class="${href === here ? "active" : ""}">${label}</a></li>`).join("")}
        </ul>
        <div class="nav-tools">
          <button class="icon-btn" id="theme-toggle" type="button"></button>
          <a class="icon-btn" href="payment.html" aria-label="Your order">${ICONS.bag}<span class="cart-count" data-count="0">0</span></a>
          <button class="icon-btn menu-toggle" id="menu-toggle" type="button" aria-label="Open menu" aria-expanded="false">${ICONS.menu}</button>
        </div>
      </nav>`;
  }

  const footer = $("#site-footer");
  if (footer) {
    footer.className = "site-footer";
    footer.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="logo" href="index.html" aria-label="Grillz Direct home"></a>
            <p style="margin-top:18px">Custom-fitted teeth jewellery, made to order. Shine without the dentist's chair.</p>
            <div class="socials">
              <a class="icon-btn" href="${INSTAGRAM}" target="_blank" rel="noopener" aria-label="Instagram @grillzdirect">${ICONS.instagram}</a>
              <a class="icon-btn" href="mailto:${EMAIL}" aria-label="Email us">${ICONS.mail}</a>
            </div>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>${PAGES.map(([href, label]) => `<li><a href="${href}">${label}</a></li>`).join("")}<li><a href="payment.html">Checkout</a></li></ul>
          </div>
          <div>
            <h4>Follow & Contact</h4>
            <ul>
              <li><a href="${INSTAGRAM}" target="_blank" rel="noopener">Instagram — @grillzdirect</a></li>
              <li><a href="mailto:${EMAIL}">${EMAIL}</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Grillz Direct. All rights reserved.</span>
          <span>50% deposit required on all orders.</span>
        </div>
      </div>`;
  }

  // shared overlays
  document.body.insertAdjacentHTML("beforeend",
    `<div class="lightbox" id="lightbox" role="dialog" aria-label="Image preview"><img alt=""></div><div class="toast" id="toast" role="status"></div>`);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2800);
}

/* ---------- cart ----------
   Items store what was ordered (teeth per arch, metal, style), not a price,
   so the total can be shown in € or £ and re-checked by the server. */
const cart = {
  items() {
    return store.get("gd-cart", []).filter((i) => Number.isInteger(i.top) && Number.isInteger(i.bottom));
  },
  save(items) { store.set("gd-cart", items); updateCartCount(); },
  add(item) {
    const items = this.items();
    items.push({ ...item, uid: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    this.save(items);
    toast(`${item.name} added to your order`);
  },
  remove(uid) { this.save(this.items().filter((i) => i.uid !== uid)); },
  clear() { this.save([]); },
  total(cur) { return this.items().reduce((s, i) => s + itemPrice(i, cur), 0); },
};
function updateCartCount() {
  const n = cart.items().length;
  $$(".cart-count").forEach((el) => { el.textContent = n; el.dataset.count = n; });
}

/* price for one arch with n teeth (9+ counts as a full arch) */
function archPrice(n, cur) {
  if (n <= 0) return 0;
  const tier = PRICE_TIERS.find((t) => n <= t.teeth);
  return tier ? tier[cur] : FULL_PRICE[cur];
}
const itemPrice = (i, cur) => archPrice(i.top, cur) + archPrice(i.bottom, cur);
const archText = (n) => (n >= 9 ? "full" : n);

/* ---------- pricing page: add-to-order buttons ---------- */
function initShop() {
  $$("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cart.add({
        name: btn.dataset.add, top: Number(btn.dataset.top), bottom: 0,
        metal: "silver", style: "Plain polish", details: "Top arch · metal confirmed at consultation",
      });
    });
  });
}

/* ---------- custom builder ---------- */
const METALS = { silver: "Silver", gold: "Gold", rose: "Rose gold" };

function initBuilder() {
  const root = $("#builder");
  if (!root) return;
  const TEETH_PER_ARCH = 10;
  const state = { top: new Set(), bottom: new Set(), metal: "silver", style: "Plain polish" };

  ["top", "bottom"].forEach((arch) => {
    const row = $(`#arch-${arch}`);
    for (let i = 0; i < TEETH_PER_ARCH; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tooth";
      b.setAttribute("aria-pressed", "false");
      b.setAttribute("aria-label", `${arch} tooth ${i + 1}`);
      b.addEventListener("click", () => {
        state[arch].has(i) ? state[arch].delete(i) : state[arch].add(i);
        update();
      });
      row.appendChild(b);
    }
  });

  // quick presets select the centred N teeth on the top arch
  $$("[data-preset]", root).forEach((chip) => {
    chip.addEventListener("click", () => {
      const n = chip.dataset.preset;
      ["top", "bottom"].forEach((a) => state[a].clear());
      if (n === "clear") return update();
      const count = n === "full" ? TEETH_PER_ARCH : Number(n);
      const start = Math.floor((TEETH_PER_ARCH - count) / 2);
      for (let i = start; i < start + count; i++) state.top.add(i);
      if (chip.dataset.both) for (let i = start; i < start + count; i++) state.bottom.add(i);
      update();
    });
  });

  $$("[data-metal]", root).forEach((chip) => chip.addEventListener("click", () => {
    state.metal = chip.dataset.metal;
    $$("[data-metal]", root).forEach((c) => c.classList.toggle("on", c === chip));
    update();
  }));
  $$("[data-style]", root).forEach((chip) => chip.addEventListener("click", () => {
    state.style = chip.dataset.style;
    $$("[data-style]", root).forEach((c) => c.classList.toggle("on", c === chip));
    update();
  }));

  function update() {
    ["top", "bottom"].forEach((arch) => {
      $$(`#arch-${arch} .tooth`).forEach((b, i) => {
        const on = state[arch].has(i);
        b.setAttribute("aria-pressed", on);
        b.classList.toggle("gold", on && state.metal === "gold");
        b.classList.toggle("rose", on && state.metal === "rose");
      });
    });
    const t = state.top.size, bt = state.bottom.size;
    const price = (cur) => archPrice(t, cur) + archPrice(bt, cur);
    const total = { EUR: price("EUR"), GBP: price("GBP") };
    const custom = state.style === "Custom design";
    const archLine = (n) => n ? `${n >= 9 ? "Full" : n + " teeth"} · ${both({ EUR: archPrice(n, "EUR"), GBP: archPrice(n, "GBP") })}` : "—";
    $("#sum-top").textContent = archLine(t);
    $("#sum-bottom").textContent = archLine(bt);
    $("#sum-metal").textContent = METALS[state.metal];
    $("#sum-style").textContent = state.style;
    $("#sum-total").innerHTML = custom ? "TBD"
      : `${money(total.EUR, "EUR")} <small class="muted">/ ${money(total.GBP, "GBP")}</small>`;
    $("#sum-deposit").textContent = custom ? "Quote first"
      : both({ EUR: total.EUR * DEPOSIT_RATE, GBP: total.GBP * DEPOSIT_RATE });
    const addBtn = $("#builder-add");
    addBtn.disabled = !(t + bt) || custom;
    $("#builder-quote").hidden = !custom;
    addBtn.hidden = custom;
  }

  $("#builder-add").addEventListener("click", () => {
    const t = state.top.size, bt = state.bottom.size;
    const parts = [];
    if (t) parts.push(`Top: ${archText(t)}`);
    if (bt) parts.push(`Bottom: ${archText(bt)}`);
    parts.push(METALS[state.metal], state.style);
    cart.add({
      name: "Custom-built grillz", top: t, bottom: bt,
      metal: state.metal, style: state.style, details: parts.join(" · "),
    });
  });

  update();
}

/* ---------- payment page ----------
   The deposit is charged through Stripe Checkout (cards, Apple Pay,
   Google Pay and PayPal). The server recalculates every price. */
const METHOD_NAMES = { apple: "Apple Pay", google: "Google Pay", card: "card", paypal: "PayPal" };

function initPayment() {
  const list = $("#cart-list");
  if (!list) return;
  let currency = getCurrency();

  if (new URLSearchParams(location.search).has("cancelled")) {
    $("#pay-result").innerHTML = `<div class="notice" style="margin-top:16px">Payment cancelled — nothing was charged. Your order is still saved here.</div>`;
  }

  function render() {
    const items = cart.items();
    list.innerHTML = items.length
      ? items.map((i) => `
          <div class="cart-item">
            <div><strong>${i.name}</strong><small>${i.details || ""}</small></div>
            <div style="display:flex;align-items:center;gap:10px;text-align:right">
              <div><strong>${money(itemPrice(i, currency), currency)}</strong>
              <small>${money(itemPrice(i, currency === "EUR" ? "GBP" : "EUR"), currency === "EUR" ? "GBP" : "EUR")}</small></div>
              <button class="remove" data-uid="${i.uid}" aria-label="Remove ${i.name}">×</button>
            </div>
          </div>`).join("")
      : `<p>Your order is empty. <a href="shop.html">Browse pricing</a> or <a href="custom.html">build your own set</a>.</p>`;
    const total = cart.total(currency);
    const deposit = total * DEPOSIT_RATE;
    $("#pay-total").textContent = money(total, currency);
    $("#pay-deposit").textContent = money(deposit, currency);
    $("#pay-balance").textContent = money(total - deposit, currency);
    $$(".pay-cta").forEach((b) => (b.disabled = !items.length));
    $$(".deposit-amount").forEach((el) => (el.textContent = money(deposit, currency)));
    $$("[data-currency]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.currency === currency));
  }

  list.addEventListener("click", (e) => {
    const btn = e.target.closest(".remove");
    if (btn) { cart.remove(btn.dataset.uid); render(); }
  });

  $$("[data-currency]").forEach((b) => b.addEventListener("click", () => {
    currency = b.dataset.currency;
    store.set("gd-currency", currency);
    render();
  }));

  // method selector
  $$(".pay-method").forEach((m) => m.addEventListener("click", () => {
    $$(".pay-method").forEach((x) => x.setAttribute("aria-checked", x === m));
    $$(".pay-panel").forEach((p) => p.classList.toggle("show", p.id === "panel-" + m.dataset.method));
  }));

  $$(".pay-cta").forEach((btn) => btn.addEventListener("click", async () => {
    const method = btn.dataset.method;
    const result = $("#pay-result");
    const label = btn.innerHTML;
    $$(".pay-cta").forEach((b) => (b.disabled = true));
    btn.textContent = "Opening secure checkout…";
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method, currency,
          items: cart.items().map(({ name, top, bottom, metal, style }) => ({ name, top, bottom, metal, style })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) { location.href = data.url; return; }
      throw new Error(data.error || "Checkout is unavailable right now.");
    } catch (err) {
      const offline = err instanceof TypeError; // fetch failed: no server running
      result.innerHTML = `<div class="notice" style="margin-top:16px"><strong>Couldn't start ${METHOD_NAMES[method]} checkout.</strong><br>
        ${offline ? "The payment server isn't running." : err.message}
        You can also DM <a href="${INSTAGRAM}" target="_blank" rel="noopener">@grillzdirect</a> or email
        <a href="mailto:${EMAIL}">${EMAIL}</a> to pay your deposit.</div>`;
      btn.innerHTML = label;
      render();
    }
  }));

  render();
}

/* ---------- thank-you page: confirm the Stripe payment ---------- */
async function initThankYou() {
  const box = $("#confirm");
  if (!box) return;
  const id = new URLSearchParams(location.search).get("session_id");
  const title = $("#confirm-title"), text = $("#confirm-text");
  if (!id) { title.textContent = "No payment found"; text.textContent = "If you've paid, check your email for a receipt from Stripe."; return; }
  try {
    const res = await fetch("/api/confirm?session_id=" + encodeURIComponent(id));
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    if (data.paid) {
      cart.clear();
      title.textContent = `Deposit paid — order ${data.reference}`;
      text.innerHTML = `We've received your ${money(data.amount, data.currency)} deposit${data.email ? ` and sent a receipt to <strong>${data.email}</strong>` : ""}.
        Your mould kit and next steps are on the way. The balance is due before collection or shipping.`;
    } else {
      title.textContent = `Order ${data.reference} — payment pending`;
      text.textContent = "Your payment is still processing. You'll get an email from Stripe once it goes through.";
    }
  } catch {
    title.textContent = "We couldn't confirm your payment yet";
    text.innerHTML = `If you were charged, you'll receive a Stripe receipt by email. Questions? Email <a href="mailto:${EMAIL}">${EMAIL}</a>.`;
  }
}

/* ---------- contact form ---------- */
function initContact() {
  const form = $("#contact-form");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = $("#form-msg");
    const data = Object.fromEntries(new FormData(form));
    if (!data.name || !data.email || !data.message) {
      msg.className = "form-msg err"; msg.textContent = "Please fill in your name, email and message."; return;
    }
    try {
      const res = await fetch("/api/contact", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      msg.className = "form-msg ok";
      msg.textContent = "Message sent! We'll get back to you within 24–48 hours.";
      form.reset();
    } catch {
      // No server (e.g. opened as a file) — fall back to the visitor's email app
      const body = `Name: ${data.name}\nEmail: ${data.email}\nTopic: ${data.topic}\n\n${data.message}`;
      location.href = `mailto:${EMAIL}?subject=${encodeURIComponent("Grillz enquiry: " + data.topic)}&body=${encodeURIComponent(body)}`;
      msg.className = "form-msg ok";
      msg.textContent = "Opening your email app to send the message…";
    }
  });
}

/* ---------- misc interactions ---------- */
function initCommon() {
  $("#theme-toggle")?.addEventListener("click", () => {
    const current = store.get("gd-theme", "auto");
    const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
    store.set("gd-theme", next);
    applyTheme(next);
    toast(next === "auto" ? "Theme now matches your device" : `${next[0].toUpperCase() + next.slice(1)} mode on`);
  });
  applyTheme(store.get("gd-theme", "auto"));

  const menuBtn = $("#menu-toggle");
  menuBtn?.addEventListener("click", () => {
    const open = $("#nav-links").classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });

  // scroll reveal
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); }
  }), { threshold: 0.12 });
  $$(".reveal").forEach((el) => io.observe(el));

  // flyer lightbox
  const lb = $("#lightbox");
  $$("[data-lightbox]").forEach((el) => el.addEventListener("click", () => {
    lb.querySelector("img").src = el.dataset.lightbox;
    lb.querySelector("img").alt = el.querySelector("img")?.alt || "";
    lb.classList.add("open");
  }));
  lb.addEventListener("click", () => lb.classList.remove("open"));
  document.addEventListener("keydown", (e) => e.key === "Escape" && lb.classList.remove("open"));

  // count-up stats
  $$("[data-count-to]").forEach((el) => {
    const end = Number(el.dataset.countTo);
    const obs = new IntersectionObserver(([en]) => {
      if (!en.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const step = (t) => {
        const p = Math.min((t - t0) / 1400, 1);
        el.textContent = (el.dataset.prefix || "") + Math.round(end * (1 - Math.pow(1 - p, 3))) + (el.dataset.suffix || "");
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    obs.observe(el);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderChrome();
  initCommon();
  updateCartCount();
  initShop();
  initBuilder();
  initPayment();
  initContact();
  initThankYou();
});
