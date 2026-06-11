const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const CODES  = JSON.parse(process.env.DISCOUNT_CODES || '{}');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const action = req.query?.action;

  // ── Discount code validation ──────────────────────────────────────────────
  if (action === 'discount') {
    const { code, subtotalCents } = req.body;
    if (!code) return res.status(400).json({ error: 'code required' });
    const discount = CODES[code.toUpperCase().trim()];
    if (!discount) return res.status(404).json({ error: 'Invalid discount code' });
    let discountCents = 0;
    if (discount.type === 'percent') {
      discountCents = Math.round((subtotalCents || 0) * discount.value / 100);
      return res.status(200).json({ discountCents, label: `${discount.value}% off` });
    }
    discountCents = Math.round(discount.value * 100);
    return res.status(200).json({ discountCents, label: `$${discount.value.toFixed(2)} off` });
  }

  // ── Write customer/shipping to PI server-side (prevents Stripe Link bypass) ─
  if (action === 'shipping') {
    const { clientSecret, name, email, phone, address, country, shippingCents, subtotalCents, discountCents } = req.body;
    if (!clientSecret) return res.status(400).json({ error: 'clientSecret required' });
    const piId = clientSecret.split('_secret_')[0];
    const update = { metadata: {} };
    if (name && address?.line1) {
      update.shipping = {
        name,
        phone: phone || undefined,
        address: { line1: address.line1, line2: address.line2 || undefined, city: address.city, postal_code: address.postcode, country },
      };
      const nameParts = name.split(' ');
      update.metadata.shippingAddress = JSON.stringify({
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        line1: address.line1,
        line2: address.line2 || '',
        city: address.city,
        postcode: address.postcode || '',
        phone: phone || '',
        country,
      });
    }
    if (email)  { update.receipt_email = email; update.metadata.customer_email = email; }
    if (name)     update.metadata.customer_name = name;
    if (country)  update.metadata.country = country;
    if (shippingCents != null) update.metadata.shipping       = String(shippingCents);
    if (subtotalCents != null) update.metadata.subtotal        = String(subtotalCents);
    if (discountCents != null) update.metadata.discount_amount = String(discountCents);
    await stripe.paymentIntents.update(piId, update);
    return res.status(200).json({ ok: true });
  }

  // ── Update PaymentIntent amount ───────────────────────────────────────────
  const { clientSecret, newAmount } = req.body;
  if (!clientSecret || !newAmount) return res.status(400).json({ error: 'clientSecret and newAmount required' });
  const piId = clientSecret.split('_secret_')[0];
  await stripe.paymentIntents.update(piId, { amount: Math.round(newAmount) });
  return res.status(200).json({ ok: true });
};
