const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { clientSecret, newAmount } = req.body;
  if (!clientSecret || !newAmount) return res.status(400).json({ error: 'clientSecret and newAmount required' });

  const piId = clientSecret.split('_secret_')[0];
  await stripe.paymentIntents.update(piId, { amount: Math.round(newAmount) });
  return res.status(200).json({ ok: true });
};
