const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const origin = req.headers.origin || 'https://nine2five-sage.vercel.app';

  const line_items = items.map(item => ({
    price_data: {
      currency: 'nzd',
      product_data: {
        name: item.size && item.size !== 'N/A'
          ? `${item.name} — Size ${item.size}`
          : item.name,
        description: 'Nine2Five · Māori Socks · Aotearoa New Zealand',
        ...(item.img ? { images: [item.img] } : {}),
      },
      unit_amount: Math.round(item.price * 100),
    },
    quantity: item.qty || 1,
  }));

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items,
    mode: 'payment',
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#collection`,
    shipping_address_collection: {
      allowed_countries: ['NZ', 'AU', 'US', 'GB', 'CA'],
    },
  });

  return res.status(200).json({ url: session.url });
};
