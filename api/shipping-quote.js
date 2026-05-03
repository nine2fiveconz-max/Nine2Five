const RATES = {
  NZ: { provider: 'NZ Post', service: 'Standard Tracked',       price: 9.50  },
  AU: { provider: 'NZ Post', service: 'International Tracked',  price: 22.00 },
  // Asia
  JP: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  SG: { provider: 'NZ Post', service: 'International Tracked',  price: 24.00 },
  HK: { provider: 'NZ Post', service: 'International Tracked',  price: 24.00 },
  KR: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  TW: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  CN: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  MY: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  TH: { provider: 'NZ Post', service: 'International Tracked',  price: 26.00 },
  PH: { provider: 'NZ Post', service: 'International Tracked',  price: 28.00 },
  ID: { provider: 'NZ Post', service: 'International Tracked',  price: 28.00 },
  VN: { provider: 'NZ Post', service: 'International Tracked',  price: 28.00 },
  IN: { provider: 'NZ Post', service: 'International Tracked',  price: 30.00 },
  // Americas
  US: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  CA: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  MX: { provider: 'NZ Post', service: 'International Tracked',  price: 36.00 },
  // UK & Europe
  GB: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  IE: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  FR: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  DE: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  IT: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  ES: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  PT: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  NL: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  BE: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  CH: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  AT: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  SE: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  NO: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  DK: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  FI: { provider: 'NZ Post', service: 'International Tracked',  price: 32.00 },
  PL: { provider: 'NZ Post', service: 'International Tracked',  price: 34.00 },
  CZ: { provider: 'NZ Post', service: 'International Tracked',  price: 34.00 },
  GR: { provider: 'NZ Post', service: 'International Tracked',  price: 34.00 },
  // Middle East
  AE: { provider: 'NZ Post', service: 'International Tracked',  price: 34.00 },
  SA: { provider: 'NZ Post', service: 'International Tracked',  price: 36.00 },
  IL: { provider: 'NZ Post', service: 'International Tracked',  price: 34.00 },
  // Africa
  ZA: { provider: 'NZ Post', service: 'International Tracked',  price: 40.00 },
  // South America
  BR: { provider: 'NZ Post', service: 'International Tracked',  price: 40.00 },
  AR: { provider: 'NZ Post', service: 'International Tracked',  price: 40.00 },
  CL: { provider: 'NZ Post', service: 'International Tracked',  price: 38.00 },
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { country } = req.body;
  if (!country) return res.status(400).json({ error: 'country required' });

  const rate = RATES[country];
  if (!rate) return res.status(200).json({ rates: [] });

  return res.status(200).json({
    rates: [{
      rate_id:        country,
      provider:       rate.provider,
      service:        rate.service,
      price:          rate.price,
      estimated_days: null,
    }],
  });
};
