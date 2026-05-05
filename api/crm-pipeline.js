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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  if (req.method === 'GET') {
    const r = await sb('crm_pipeline?select=*&order=created_at.asc');
    return res.status(200).json(await r.json());
  }

  if (req.method === 'POST') {
    const { contact_email, contact_name, title, stage, value, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await sb('crm_pipeline', {
      method: 'POST',
      body: JSON.stringify({ contact_email, contact_name, title, stage: stage || 'lead', value: value || 0, notes }),
    });
    return res.status(201).json(await r.json());
  }

  if (req.method === 'PATCH') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    const fields = { ...req.body, updated_at: new Date().toISOString() };
    const r = await sb(`crm_pipeline?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
    return res.status(200).json(await r.json());
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    await sb(`crm_pipeline?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
};
