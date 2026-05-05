const ADMIN_PASSWORD      = process.env.ADMIN_PASSWORD;
const ESHIP_API_KEY       = process.env.NZPOST_ESHIP_API_KEY;
const ESHIP_BASE          = 'https://api.myeship.co/rest';
const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
}

async function handleQuote(req, res) {
  const { address_to, weight_kg } = req.body;
  const payload = {
    address_from: {
      name:    process.env.NZPOST_SENDER_NAME,
      street1: process.env.NZPOST_SENDER_STREET,
      city:    process.env.NZPOST_SENDER_CITY,
      zip:     process.env.NZPOST_SENDER_POSTCODE,
      country: 'NZ',
      phone:   process.env.NZPOST_SENDER_PHONE,
    },
    address_to: {
      name:    address_to.name,
      street1: address_to.street1,
      city:    address_to.city,
      zip:     address_to.zip,
      country: address_to.country || 'NZ',
      phone:   address_to.phone || '',
    },
    parcels: [{ length: 20, width: 15, height: 8, distance_unit: 'cm', weight: weight_kg || 0.3, mass_unit: 'kg' }],
  };
  const r = await fetch(`${ESHIP_BASE}/quotation`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': ESHIP_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  return res.status(200).json(data);
}

async function handleShip(req, res) {
  const { order_id, rate_id, address_to } = req.body;
  if (!rate_id || !order_id) return res.status(400).json({ error: 'rate_id and order_id required' });
  const r = await fetch(`${ESHIP_BASE}/shipment`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': ESHIP_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rate_id, label_format: 'PDF' }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(r.status).json({ error: data });
  const { tracking_number, label_url, tracking_url_custom, carrier } = data;
  await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${order_id}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ tracking_number, label_url, shipping_carrier: carrier || 'NZ Post', shipped_at: new Date().toISOString(), status: 'shipped', shipping_address: address_to }),
  });
  return res.status(200).json({ tracking_number, label_url, tracking_url: tracking_url_custom });
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  const action = req.query?.action;
  if (action === 'quote') return handleQuote(req, res);
  if (action === 'ship')  return handleShip(req, res);
  return res.status(400).json({ error: 'action must be quote or ship' });
};
