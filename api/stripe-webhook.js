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

    // Push order to NZ Post eShip (unit price $20, weight 65g, Default package)
    try {
      const eshipItems = items.length
        ? items.map(item => ({
            SKU:         `${item.name || ''} ${item.size || ''}`.trim(),
            description: `${item.name || ''}${item.size ? ` – ${item.size}` : ''}`,
            quantity:    item.qty || 1,
            price:       '20.00',
            weight:      '65',
            currency:    'NZD',
          }))
        : [{ SKU: 'SOCKS', description: 'Socks', quantity: 1, price: '20.00', weight: '65', currency: 'NZD' }];
      await fetch('https://api.myeship.co/rest/order', {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': process.env.NZPOST_ESHIP_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address_from: {
            name:    process.env.NZPOST_SENDER_NAME,
            street1: process.env.NZPOST_SENDER_STREET,
            city:    process.env.NZPOST_SENDER_CITY,
            zip:     process.env.NZPOST_SENDER_POSTCODE,
            country: 'NZ',
            phone:   process.env.NZPOST_SENDER_PHONE,
          },
          address_to: {
            name:    customerName || customerEmail || 'Customer',
            street1: shippingAddress?.line1    || '',
            street2: shippingAddress?.line2    || '',
            city:    shippingAddress?.city     || '',
            zip:     shippingAddress?.postcode || '',
            country: shippingAddress?.country  || 'NZ',
            phone:   shippingAddress?.phone    || '',
            email:   customerEmail || '',
          },
          order_info: {
            order_num:   pi.id,
            paid:        1,
            status:      0,
            total_price: (pi.amount_received / 100).toFixed(2),
            currency:    'NZD',
          },
          parcels: [{ length: 18, width: 28, height: 5, distance_unit: 'cm', weight: 0.12, mass_unit: 'kg' }],
          items: eshipItems,
        }),
      });
    } catch (eshipErr) {
      console.error('[webhook] eShip order push failed:', eshipErr.message);
    }

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
