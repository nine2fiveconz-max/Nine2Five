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

    // Parse items
    let items = [];
    try {
      items = pi.metadata?.items_json ? JSON.parse(pi.metadata.items_json) : [];
    } catch (_) {}

    // Customer info — prefer server-side PI data written by ?action=shipping
    const customerName  = pi.shipping?.name || pi.metadata?.customer_name || null;
    const customerEmail = pi.receipt_email  || pi.metadata?.customer_email || null;

    // Shipping address — prefer pi.shipping (server-side), fall back to metadata JSON
    let shippingAddress = null;
    if (pi.shipping?.address) {
      const a = pi.shipping.address;
      const nameParts = (pi.shipping.name || '').split(' ');
      shippingAddress = {
        first_name: nameParts[0] || '',
        last_name:  nameParts.slice(1).join(' ') || '',
        line1:    a.line1        || '',
        line2:    a.line2        || '',
        city:     a.city         || '',
        region:   a.state        || '',
        postcode: a.postal_code  || '',
        phone:    pi.shipping.phone || '',
        country:  a.country      || '',
      };
    } else if (pi.metadata?.shippingAddress) {
      try { shippingAddress = JSON.parse(pi.metadata.shippingAddress); } catch (_) {}
    }

    // Amounts in cents
    const subtotalCents = pi.metadata?.subtotal        ? parseInt(pi.metadata.subtotal, 10)        : null;
    const shippingCents = pi.metadata?.shipping        ? parseInt(pi.metadata.shipping, 10)        : null;
    const discountCents = pi.metadata?.discount_amount ? parseInt(pi.metadata.discount_amount, 10) : null;

    // Insert order
    try {
      await supabase('orders', 'POST', {
        stripe_payment_intent_id: pi.id,
        guest_email:           customerEmail,
        status:                'processing',
        subtotal:              subtotalCents,
        shipping_cost:         shippingCents,
        total:                 pi.amount_received,
        discount_amount_cents: discountCents,
        shipping_address:      shippingAddress,
        items:                 items.length ? items : null,
        notes:                 customerName ? null : 'Address not captured — customer used express checkout',
      });
    } catch (err) {
      if (!err.message.includes('duplicate')) console.error('Order insert error:', err.message);
    }

    // Decrement inventory
    for (const item of items) {
      if (!item.name || !item.size) continue;
      try {
        const rows = await supabase(
          `inventory?product_name=eq.${encodeURIComponent(item.name)}&size=eq.${encodeURIComponent(item.size)}&select=id,stock`,
          'GET'
        );
        if (rows && rows[0]) {
          const newStock = Math.max(0, rows[0].stock - (item.qty || 1));
          await supabase(`inventory?id=eq.${rows[0].id}`, 'PATCH', { stock: newStock });
        }
      } catch (err) {
        console.error('Inventory decrement error:', err.message);
      }
    }
  }

  return res.status(200).json({ received: true });
};
