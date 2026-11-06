// Shared pricing + Stripe helpers for the Netlify Functions.
// Prices must match PRICE_TIERS in js/main.js (and server.py for local runs).

export const PRICE_TIERS = [
  { teeth: 1, EUR: 40, GBP: 35 },
  { teeth: 2, EUR: 60, GBP: 50 },
  { teeth: 4, EUR: 90, GBP: 75 },
  { teeth: 6, EUR: 120, GBP: 100 },
  { teeth: 8, EUR: 150, GBP: 125 },
];
export const FULL_PRICE = { EUR: 200, GBP: 170 };
export const DEPOSIT_RATE = 0.5;
const MAX_TEETH_PER_ARCH = 10;
const METALS = { silver: "Silver", gold: "Gold", rose: "Rose gold" };
const STYLES = new Set(["Plain polish", "Open face", "Diamond cut"]);
// Methods the payment page offers. Stripe Checkout shows whichever of these are
// switched on in Dashboard > Settings > Payment methods (Stripe no longer lets
// the site pick one), so this list is only used to validate the request.
export const STRIPE_METHODS = { apple: "card", google: "card", card: "card", paypal: "paypal" };

export function archPrice(teeth, currency) {
  if (teeth <= 0) return 0;
  const tier = PRICE_TIERS.find((t) => teeth <= t.teeth);
  return tier ? tier[currency] : FULL_PRICE[currency];
}

/** Validate the basket and price it ourselves — never trust browser prices. */
export function priceOrder(items, currency) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 20) throw new Error("Your order is empty.");
  let total = 0;
  const lines = items.map((item) => {
    const { top, bottom } = item ?? {};
    const valid = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_TEETH_PER_ARCH;
    if (!valid(top) || !valid(bottom) || top + bottom === 0) throw new Error("Invalid teeth selection.");
    const style = item.style ?? "Plain polish";
    if (!STYLES.has(style)) throw new Error("Custom designs need a quote before payment.");
    const metal = METALS[item.metal] ?? "Silver";
    const price = archPrice(top, currency) + archPrice(bottom, currency);
    const arches = [top && `Top ${top >= 9 ? "full" : top}`, bottom && `Bottom ${bottom >= 9 ? "full" : bottom}`].filter(Boolean);
    total += price;
    return { summary: `${arches.join(", ")} · ${metal} · ${style}`, price };
  });
  return { lines, total };
}

/** Turn nested objects/arrays into Stripe's form encoding: a[b][0][c]=... */
function flatten(params, prefix = "", out = []) {
  for (const [key, value] of Object.entries(params)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value !== null && typeof value === "object") flatten(value, name, out);
    else out.push([name, String(value)]);
  }
  return out;
}

export async function stripe(method, path, params) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Online payments aren't switched on yet (no Stripe key set).");
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(params && { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: params ? new URLSearchParams(flatten(params)) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Stripe error ${res.status}`);
  return data;
}

export const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
