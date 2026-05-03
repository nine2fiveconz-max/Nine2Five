const INTERNATIONAL = {
  // Asia
  JP: 26.00, SG: 24.00, HK: 24.00, KR: 26.00, TW: 26.00,
  CN: 26.00, MY: 26.00, TH: 26.00, PH: 28.00, ID: 28.00,
  VN: 28.00, IN: 30.00,
  // Americas
  US: 32.00, CA: 32.00, MX: 36.00,
  // UK & Europe
  GB: 32.00, IE: 32.00, FR: 32.00, DE: 32.00, IT: 32.00,
  ES: 32.00, PT: 32.00, NL: 32.00, BE: 32.00, CH: 32.00,
  AT: 32.00, SE: 32.00, NO: 32.00, DK: 32.00, FI: 32.00,
  PL: 34.00, CZ: 34.00, GR: 34.00,
  // Middle East
  AE: 34.00, SA: 36.00, IL: 34.00,
  // Africa
  ZA: 40.00,
  // South America
  BR: 40.00, AR: 40.00, CL: 38.00,
};

function nzRate(qty) {
  if (qty <= 2)  return { service: 'Standard', price: 6.00  };
  if (qty === 3) return { service: 'Standard', price: 7.00  };
  if (qty <= 6)  return { service: 'Standard', price: 9.00  };
                 return { service: 'Standard', price: 16.00 };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { country, qty } = req.body;
  if (!country) return res.status(400).json({ error: 'country required' });

  let rate;

  if (country === 'NZ') {
    const r = nzRate(qty || 1);
    rate = { rate_id: 'NZ', provider: 'NZ Post', service: r.service, price: r.price, estimated_days: null };
  } else if (country === 'AU') {
    rate = { rate_id: 'AU', provider: 'NZ Post', service: 'Economy International', price: 16.00, estimated_days: null };
  } else if (INTERNATIONAL[country]) {
    rate = { rate_id: country, provider: 'NZ Post', service: 'International Tracked', price: INTERNATIONAL[country], estimated_days: null };
  } else {
    return res.status(200).json({ rates: [] });
  }

  return res.status(200).json({ rates: [rate] });
};
