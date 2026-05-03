const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ESHIP_API_KEY = process.env.NZPOST_ESHIP_API_KEY;
const ESHIP_BASE = 'https://api.myeship.co/rest';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  const { order_id, rate_id, address_to } = req.body;
  if (!rate_id || !order_id) return res.status(400).json({ error: 'rate_id and order_id required' });

  // Create shipment in eShip
  const r = await fetch(`${ESHIP_BASE}/shipment`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ESHIP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ rate_id, label_format: 'PDF' }),
  });

  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });

  const { tracking_number, label_url, tracking_url_custom, carrier } = data;

  // Save to Supabase order
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      tracking_number,
      label_url,
      shipping_carrier: carrier || 'NZ Post',
      shipped_at: new Date().toISOString(),
      status: 'shipped',
      shipping_address: address_to,
    }),
  });

  return res.status(200).json({ tracking_number, label_url, tracking_url: tracking_url_custom });
};
