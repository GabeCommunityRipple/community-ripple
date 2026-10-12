// admin.js — password-protected admin operations (service role key stays server-side)

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function db(table, { method = 'GET', filter = '', body = null } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${filter}`, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : null
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${table} failed: ${res.status} ${await res.text()}`);
  return method === 'GET' ? await res.json() : null;
}

// Constant-time comparison so the password can't be guessed via response timing
function isAuthorized(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured.' });
  }

  const { action } = req.query;
  const body = req.body || {};

  try {
    if (action === 'load') {
      const [ripples, subscribers, members] = await Promise.all([
        db('ripples', { filter: '?select=*&order=created_at.desc' }),
        db('subscribers', { filter: '?select=*&order=created_at.desc' }),
        db('ripple_members', { filter: '?select=*' })
      ]);
      return res.status(200).json({ ripples, subscribers, members });
    }

    if (action === 'close_ripple') {
      if (!body.id) return res.status(400).json({ error: 'Ripple id is required.' });
      await db('ripples', {
        method: 'PATCH',
        filter: `?id=eq.${encodeURIComponent(body.id)}`,
        body: { status: 'closed' }
      });
      return res.status(200).json({ success: true });
    }

    if (action === 'delete_subscriber') {
      if (!body.id) return res.status(400).json({ error: 'Subscriber id is required.' });
      const id = encodeURIComponent(body.id);
      await db('ripple_members', { method: 'DELETE', filter: `?subscriber_id=eq.${id}` });
      await db('subscribers', { method: 'DELETE', filter: `?id=eq.${id}` });
      return res.status(200).json({ success: true });
    }

    if (action === 'export_ripple') {
      if (!body.id) return res.status(400).json({ error: 'Ripple id is required.' });
      const members = await db('ripple_members', {
        filter: `?ripple_id=eq.${encodeURIComponent(body.id)}&select=subscriber_id`
      });
      const ids = members.map(m => m.subscriber_id);
      if (ids.length === 0) return res.status(200).json({ subscribers: [] });
      const subscribers = await db('subscribers', {
        filter: `?id=in.(${ids.map(encodeURIComponent).join(',')})&select=email,address,lat,lng,zip`
      });
      return res.status(200).json({ subscribers });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    console.error('Admin API error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
