const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPABASE_URL   = process.env.SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;

const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
  ...opts,
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(opts.headers || {}),
  },
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  const email = req.query?.email || req.body?.email;

  if (req.method === 'GET') {
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = await sb(`crm_notes?contact_email=eq.${encodeURIComponent(email)}&order=created_at.desc`);
    return res.status(200).json(await r.json());
  }

  if (req.method === 'POST') {
    const { contact_email, content } = req.body;
    if (!contact_email || !content) return res.status(400).json({ error: 'contact_email and content required' });
    const r = await sb('crm_notes', {
      method: 'POST',
      body: JSON.stringify({ contact_email: contact_email.toLowerCase().trim(), content }),
    });
    return res.status(201).json(await r.json());
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    await sb(`crm_notes?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
