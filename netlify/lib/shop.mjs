// Shared pricing + Stripe helpers for the Netlify Functions.
// Prices must match PRICES in js/main.js (and server.py for local runs).

// Price per arch for each metal: [teeth, EUR, GBP]; "full" covers 9+ teeth.
export const PRICES = {
  silver: { tiers: [[1, 40, 35], [2, 60, 50], [4, 90, 75], [6, 120, 100], [8, 150, 125]], full: [200, 170] },
  gold: { tiers: [[1, 160, 140], [2, 300, 260], [4, 560, 490], [6, 800, 700], [8, 1040, 910]], full: [1250, 1090] },
  rose: { tiers: [[1, 170, 150], [2, 315, 275], [4, 590, 515], [6, 840, 735], [8, 1090, 950]], full: [1310, 1145] },
};
export const CURRENCIES = ["EUR", "GBP"];
export const DEPOSIT_RATE = 0.5;
const MAX_TEETH_PER_ARCH = 10;
const METALS = { silver: "Sterling silver", gold: "9ct gold", rose: "9ct rose gold" };
const STYLES = new Set(["Plain polish", "Open face", "Diamond cut"]);
// Methods the payment page offers. Stripe Checkout shows whichever of these are
// switched on in Dashboard > Settings > Payment methods (Stripe no longer lets
// the site pick one), so this list is only used to validate the request.
export const STRIPE_METHODS = { apple: "card", google: "card", card: "card", paypal: "paypal" };

export function archPrice(teeth, currency, metal = "silver") {
  if (teeth <= 0) return 0;
  const table = PRICES[metal];
  const col = CURRENCIES.indexOf(currency) + 1;
  const tier = table.tiers.find((t) => teeth <= t[0]);
  return tier ? tier[col] : table.full[col - 1];
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
    if (!(item.metal in METALS)) throw new Error("Choose silver, gold or rose gold.");
    const metal = METALS[item.metal];
    const price = archPrice(top, currency, item.metal) + archPrice(bottom, currency, item.metal);
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
