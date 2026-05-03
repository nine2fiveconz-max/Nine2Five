const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const NZ_TOKEN_URL = 'https://api.nzpost.co.nz/oauth2/accesstoken/get?grant_type=client_credentials';
const NZ_SUGGEST_URL = 'https://api.nzpost.co.nz/addresschecker/1.0/suggest';
const NZ_DETAIL_URL  = 'https://api.nzpost.co.nz/addresschecker/1.0/details';

// Simple in-memory token cache (persists for warm function lifetime)
let cachedToken = null;
let tokenExpiry = 0;

async function getNZToken() {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(NZ_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      client_id: process.env.NZPOST_CLIENT_ID,
      client_secret: process.env.NZPOST_CLIENT_SECRET,
    },
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  return cachedToken;
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { q, country, addressId } = req.query;
  if (!q && !addressId) return res.status(400).json({ error: 'q or addressId required' });

  // ── Australia: free OpenStreetMap Photon ──
  if (country === 'AU') {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=en&limit=8&countrycode=au&osm_tag=place:house&osm_tag=highway`;
    const r = await fetch(url, { headers: { 'User-Agent': 'Nine2Five/1.0' } });
    const data = await r.json();
    const suggestions = (data.features || [])
      .filter(f => f.properties.street || f.properties.name)
      .map(f => {
        const p = f.properties;
        const street = p.housenumber ? `${p.housenumber} ${p.street || p.name}` : (p.street || p.name || '');
        return {
          label: [street, p.suburb || p.district, p.city || p.town || p.village, p.postcode].filter(Boolean).join(', '),
          street1: street,
          suburb:  p.suburb || p.district || '',
          city:    p.city || p.town || p.village || '',
          postcode: p.postcode || '',
          country: 'AU',
        };
      })
      .filter(s => s.street1);
    return res.status(200).json({ suggestions });
  }

  // ── New Zealand: NZ Post Address Checker ──
  try {
    const token = await getNZToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      client_id: process.env.NZPOST_CLIENT_ID,
    };

    // If addressId provided, return full details
    if (addressId) {
      const r = await fetch(`${NZ_DETAIL_URL}?addressId=${encodeURIComponent(addressId)}`, { headers });
      const data = await r.json();
      const d = data.details?.[0] || {};
      return res.status(200).json({
        street1:  d.addressLine || '',
        suburb:   d.suburb || '',
        city:     d.mailTown || d.town || '',
        postcode: d.postCode || '',
        country:  'NZ',
      });
    }

    // Otherwise return suggestions
    const r = await fetch(`${NZ_SUGGEST_URL}?q=${encodeURIComponent(q)}&max=8`, { headers });
    const data = await r.json();
    const suggestions = (data.addresses || []).map(a => ({
      label:     a.fullAddress || a.address,
      addressId: a.addressId,
    }));
    return res.status(200).json({ suggestions });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
