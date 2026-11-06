// GET /api/confirm?session_id=cs_... — the thank-you page asks whether the payment went through.
import { stripe, json } from "../lib/shop.mjs";

export default async (req) => {
  const sessionId = new URL(req.url).searchParams.get("session_id") || "";
  if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return json(400, { error: "Unknown payment" });
  try {
    const s = await stripe("GET", `checkout/sessions/${sessionId}`);
    return json(200, {
      paid: s.payment_status === "paid",
      reference: s.metadata?.reference || "",
      amount: (s.amount_total || 0) / 100,
      currency: (s.currency || "eur").toUpperCase(),
      email: s.customer_details?.email || null,
    });
  } catch (e) {
    return json(502, { error: e.message });
  }
};

export const config = { path: "/api/confirm" };
