const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { items, ref } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items' });

  const amount = items.reduce((sum, item) => sum + Math.round(item.price * 100) * (item.qty || 1), 0);

  // Affiliate ref — trust the client only for the code string; sanitize hard (lowercase).
  let affiliateRef = null;
  if (typeof ref === 'string') {
    const clean = ref.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
    if (clean) affiliateRef = clean;
  }

  const metadata = {
    order: items.map(i => `${i.name} (${i.size}) x${i.qty}`).join(', ').slice(0, 499),
    items_json: JSON.stringify(items).slice(0, 499),
  };
  if (affiliateRef) metadata.affiliate_ref = affiliateRef;

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'nzd',
    metadata,
  });

  return res.status(200).json({ clientSecret: paymentIntent.client_secret });
};
