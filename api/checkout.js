const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { productName, priceNZD, imageUrl } = req.body;

  if (!productName || !priceNZD) {
    return res.status(400).json({ error: 'Missing product details' });
  }

  const origin = req.headers.origin || 'https://nine2five-sage.vercel.app';

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'nzd',
        product_data: {
          name: productName,
          description: 'Māori sock design by Nine2Five · Aotearoa New Zealand',
          ...(imageUrl ? { images: [imageUrl] } : {}),
        },
        unit_amount: Math.round(priceNZD * 100),
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/#collection`,
    shipping_address_collection: {
      allowed_countries: ['NZ', 'AU', 'US', 'GB', 'CA'],
    },
    metadata: {
      product: productName,
    },
  });

  return res.status(200).json({ url: session.url });
};
