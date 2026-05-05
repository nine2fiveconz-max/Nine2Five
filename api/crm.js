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

// ── Contacts ────────────────────────────────────────────────────────────────

async function contacts(req, res) {
  if (req.method === 'GET') {
    const [ordersRes, crmRes] = await Promise.all([
      sb('orders?select=customer_email,customer_name,customer_phone,total,created_at&order=created_at.desc'),
      sb('crm_contacts?select=*'),
    ]);
    const orders = await ordersRes.json();
    const crm    = await crmRes.json();

    const map = {};
    for (const o of (Array.isArray(orders) ? orders : [])) {
      const email = o.customer_email?.toLowerCase().trim();
      if (!email) continue;
      if (!map[email]) map[email] = { email, name: o.customer_name || '', phone: o.customer_phone || '', total_spent: 0, order_count: 0, last_order_at: null, source: 'order' };
      map[email].total_spent += parseFloat(o.total || 0);
      map[email].order_count += 1;
      if (!map[email].last_order_at || o.created_at > map[email].last_order_at) map[email].last_order_at = o.created_at;
    }

    const crmMap = {};
    for (const c of (Array.isArray(crm) ? crm : [])) crmMap[c.email?.toLowerCase().trim()] = c;

    for (const c of (Array.isArray(crm) ? crm : [])) {
      const email = c.email?.toLowerCase().trim();
      if (!map[email]) map[email] = { email, name: [c.first_name, c.last_name].filter(Boolean).join(' '), phone: c.phone || '', total_spent: 0, order_count: 0, last_order_at: null, source: 'manual' };
    }

    const result = Object.values(map).map(c => {
      const e = crmMap[c.email] || {};
      return { ...c, first_name: e.first_name || c.name.split(' ')[0] || '', last_name: e.last_name || c.name.split(' ').slice(1).join(' ') || '', company: e.company || '', tags: e.tags || [], crm_id: e.id || null };
    }).sort((a, b) => (b.last_order_at || '') > (a.last_order_at || '') ? 1 : -1);

    return res.status(200).json(result);
  }

  if (req.method === 'POST') {
    const { email, first_name, last_name, phone, company, tags } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = await sb('crm_contacts', { method: 'POST', body: JSON.stringify({ email: email.toLowerCase().trim(), first_name, last_name, phone, company, tags: tags || [], source: 'manual' }) });
    const data = await r.json();
    return res.status(r.ok ? 201 : 400).json(data);
  }

  if (req.method === 'PATCH') {
    const { email, ...fields } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    fields.updated_at = new Date().toISOString();
    const r = await sb(`crm_contacts?email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify(fields) });
    if (r.status === 404 || r.status === 406) {
      const ins = await sb('crm_contacts', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify({ email: email.toLowerCase().trim(), ...fields }) });
      return res.status(200).json(await ins.json());
    }
    return res.status(200).json(await r.json());
  }

  return res.status(405).end();
}

// ── Notes ────────────────────────────────────────────────────────────────────

async function notes(req, res) {
  const email = req.query?.email || req.body?.email;

  if (req.method === 'GET') {
    if (!email) return res.status(400).json({ error: 'email required' });
    const r = await sb(`crm_notes?contact_email=eq.${encodeURIComponent(email)}&order=created_at.desc`);
    return res.status(200).json(await r.json());
  }

  if (req.method === 'POST') {
    const { contact_email, content } = req.body;
    if (!contact_email || !content) return res.status(400).json({ error: 'contact_email and content required' });
    const r = await sb('crm_notes', { method: 'POST', body: JSON.stringify({ contact_email: contact_email.toLowerCase().trim(), content }) });
    return res.status(201).json(await r.json());
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({ error: 'id required' });
    await sb(`crm_notes?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).end();
}

// ── Pipeline ─────────────────────────────────────────────────────────────────

async function pipeline(req, res) {
  if (req.method === 'GET') {
    const r = await sb('crm_pipeline?select=*&order=created_at.asc');
    return res.status(200).json(await r.json());
  }

  if (req.method === 'POST') {
    const { contact_email, contact_name, title, stage, value, notes: n } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await sb('crm_pipeline', { method: 'POST', body: JSON.stringify({ contact_email, contact_name, title, stage: stage || 'lead', value: value || 0, notes: n }) });
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
}

// ── Router ───────────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers['x-admin-token'] !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Unauthorised' });

  const resource = req.query?.resource;
  if (resource === 'contacts') return contacts(req, res);
  if (resource === 'notes')    return notes(req, res);
  if (resource === 'pipeline') return pipeline(req, res);
  return res.status(400).json({ error: 'resource must be contacts, notes, or pipeline' });
};
