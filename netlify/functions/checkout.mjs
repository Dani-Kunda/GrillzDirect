// POST /api/checkout — works out the 50% deposit and opens a Stripe Checkout page
// (card, Apple Pay, Google Pay or PayPal). Orders are recorded in Stripe itself:
// Dashboard > Payments shows each one with its reference and order details.
import { DEPOSIT_RATE, FULL_PRICE, STRIPE_METHODS, priceOrder, stripe, json } from "../lib/shop.mjs";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object") return json(400, { error: "Invalid request" });

  const { currency, method } = data;
  if (!(currency in FULL_PRICE) || !(method in STRIPE_METHODS)) {
    return json(400, { error: "Choose a currency and payment method." });
  }

  let order;
  try {
    order = priceOrder(data.items, currency);
  } catch (e) {
    return json(400, { error: e.message });
  }

  const depositCents = Math.round(order.total * DEPOSIT_RATE * 100);
  const reference = "GD-" + new Date().toISOString().slice(2, 19).replace(/[-:]/g, "").replace("T", "-");
  const summary = order.lines.map((l) => l.summary).join(" | ").slice(0, 450);
  // Netlify sets URL to the site's main address; fall back to wherever the request came from
  const site = process.env.URL || new URL(req.url).origin;

  try {
    const session = await stripe("POST", "checkout/sessions", {
      mode: "payment",
      payment_method_types: [STRIPE_METHODS[method]],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: depositCents,
          product_data: { name: `50% deposit — Grillz Direct order ${reference}`, description: summary },
        },
      }],
      shipping_address_collection: { allowed_countries: ["IE", "GB"] },
      phone_number_collection: { enabled: true },
      client_reference_id: reference,
      metadata: { reference, order_total: `${order.total.toFixed(2)} ${currency}`, items: summary },
      payment_intent_data: { description: `Grillz Direct ${reference} deposit`, metadata: { reference } },
      success_url: `${site}/thank-you.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${site}/payment.html?cancelled=1`,
    });
    return json(200, { url: session.url, reference });
  } catch (e) {
    console.error("Stripe checkout failed:", e.message);
    const notConfigured = !process.env.STRIPE_SECRET_KEY;
    return json(notConfigured ? 503 : 502, { error: notConfigured ? e.message : `Payment provider error: ${e.message}` });
  }
};

export const config = { path: "/api/checkout" };
