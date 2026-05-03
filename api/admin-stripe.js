const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const [balance, paymentIntents] = await Promise.all([
    stripe.balance.retrieve(),
    stripe.paymentIntents.list({ limit: 100, expand: ['data.latest_charge'] }),
  ]);

  const succeeded = paymentIntents.data.filter(pi => pi.status === 'succeeded');

  return res.status(200).json({
    balance: {
      available: balance.available,
      pending: balance.pending,
    },
    payments: succeeded.map(pi => ({
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      created: pi.created,
      description: pi.description,
      receipt_email: pi.receipt_email,
      customer_name: pi.shipping?.name || pi.metadata?.customer_name || null,
      customer_email: pi.receipt_email || pi.metadata?.customer_email || null,
      order: pi.metadata?.order || null,
      receipt_url: pi.latest_charge?.receipt_url || null,
    })),
  });
};
