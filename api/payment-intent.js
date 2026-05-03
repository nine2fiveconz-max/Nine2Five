const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { items } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'No items' });

  const amount = items.reduce((sum, item) => sum + Math.round(item.price * 100) * (item.qty || 1), 0);

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'nzd',
    metadata: {
      order: items.map(i => `${i.name} (${i.size}) x${i.qty}`).join(', ').slice(0, 499),
    },
  });

  return res.status(200).json({ clientSecret: paymentIntent.client_secret });
};
