const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

async function supabaseFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorised' });
  }

  const { customer_name, customer_email, payment_method, items, decrement_stock } = req.body;

  if (!items || !items.length) return res.status(400).json({ error: 'No items' });

  const amount_nzd = items.reduce((s, i) => s + (i.price * (i.qty || 1)), 0).toFixed(2);

  // Insert order
  const [order] = await supabaseFetch('orders', 'POST', {
    stripe_pi_id: null,
    source: 'pos',
    payment_method: payment_method || 'cash',
    customer_name: customer_name || null,
    customer_email: customer_email || null,
    amount_nzd,
    status: 'paid',
    items,
  });

  // Decrement inventory if requested
  if (decrement_stock !== false) {
    for (const item of items) {
      const rows = await supabaseFetch(
        `inventory?product_name=eq.${encodeURIComponent(item.name)}&size=eq.${encodeURIComponent(item.size)}&select=id,stock`,
        'GET'
      );
      if (rows && rows[0]) {
        const newStock = Math.max(0, rows[0].stock - (item.qty || 1));
        await supabaseFetch(`inventory?id=eq.${rows[0].id}`, 'PATCH', { stock: newStock });
      }
    }
  }

  return res.status(200).json({ ok: true, order });
};
