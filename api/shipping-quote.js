const ESHIP_API_KEY = process.env.NZPOST_ESHIP_API_KEY;
const ESHIP_BASE = 'https://api.myeship.co/rest';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { country, city, postcode, qty } = req.body;
  if (!country) return res.status(400).json({ error: 'country required' });

  const weight = Math.max(0.15, (qty || 1) * 0.15);

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
      name:    'Customer',
      street1: '1 Main Street',
      city:    city || 'Unknown',
      zip:     postcode || '',
      country,
      phone:   '',
    },
    parcels: [{
      length: 20, width: 15, height: 8,
      distance_unit: 'cm',
      weight,
      mass_unit: 'kg',
    }],
  };

  if (!ESHIP_API_KEY) {
    console.error('NZPOST_ESHIP_API_KEY is not set');
    return res.status(500).json({ error: 'Shipping not configured', detail: 'Missing API key' });
  }

  const r = await fetch(`${ESHIP_BASE}/quotation`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ESHIP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json();
  if (!r.ok) {
    console.error('eShip quotation error', r.status, JSON.stringify(data));
    return res.status(r.status).json({ error: 'Could not fetch rates', detail: data });
  }

  const rates = (data.rates || data || [])
    .filter(r => r.amount || r.price)
    .sort((a, b) => (a.amount || a.price) - (b.amount || b.price))
    .map(r => ({
      rate_id:       r.rate_id || r.object_id,
      provider:      r.provider || r.carrier || 'NZ Post',
      service:       r.servicelevel?.name || r.service || 'Standard',
      price:         parseFloat(r.amount || r.price || 0),
      estimated_days: r.estimated_days || null,
    }));

  return res.status(200).json({ rates });
};
