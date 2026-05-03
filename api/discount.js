// DISCOUNT_CODES env var: JSON like {"N2F10":{"type":"percent","value":10},"STAFF50":{"type":"percent","value":50}}
const CODES = JSON.parse(process.env.DISCOUNT_CODES || '{}');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, subtotalCents } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const discount = CODES[code.toUpperCase().trim()];
  if (!discount) return res.status(404).json({ error: 'Invalid discount code' });

  let discountCents = 0;
  if (discount.type === 'percent') {
    discountCents = Math.round((subtotalCents || 0) * discount.value / 100);
    return res.status(200).json({ discountCents, label: `${discount.value}% off` });
  } else {
    discountCents = Math.round(discount.value * 100);
    return res.status(200).json({ discountCents, label: `$${discount.value.toFixed(2)} off` });
  }
};
