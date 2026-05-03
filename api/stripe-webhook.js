const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabase(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: method === 'POST' ? 'return=minimal' : '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${method} ${path} failed: ${text}`);
  }
  return method === 'GET' ? res.json() : null;
}

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook signature failed: ${err.message}` });
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object;

    // Parse order metadata written by /api/payment-intent.js
    const itemsRaw = pi.metadata?.order || '';
    // Also check if items JSON was stored
    let items = [];
    try {
      items = pi.metadata?.items_json ? JSON.parse(pi.metadata.items_json) : [];
    } catch (_) {}

    // Insert order
    try {
      await supabase('orders', 'POST', {
        stripe_pi_id: pi.id,
        customer_name: pi.shipping?.name || pi.metadata?.customer_name || null,
        customer_email: pi.receipt_email || pi.metadata?.customer_email || null,
        amount_nzd: (pi.amount_received / 100).toFixed(2),
        status: 'paid',
        items: items.length ? items : itemsRaw,
      });
    } catch (err) {
      // Duplicate — already processed
      if (!err.message.includes('duplicate')) console.error('Order insert error:', err.message);
    }

    // Decrement inventory for each item
    for (const item of items) {
      if (!item.name || !item.size) continue;
      try {
        // Fetch current stock
        const rows = await supabase(
          `inventory?product_name=eq.${encodeURIComponent(item.name)}&size=eq.${encodeURIComponent(item.size)}&select=id,stock`,
          'GET'
        );
        if (rows && rows[0]) {
          const newStock = Math.max(0, rows[0].stock - (item.qty || 1));
          await supabase(
            `inventory?id=eq.${rows[0].id}`,
            'PATCH',
            { stock: newStock }
          );
        }
      } catch (err) {
        console.error('Inventory decrement error:', err.message);
      }
    }
  }

  return res.status(200).json({ received: true });
};
