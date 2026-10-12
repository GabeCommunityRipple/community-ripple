// ripple-public.js — returns only non-sensitive fields for a single ripple (used by ripple.html)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PUBLIC_FIELDS = ['id', 'service_type', 'member_count', 'discount_tier', 'status', 'expires_at'];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Ripple id is required.' });

  try {
    const dbRes = await fetch(`${SUPABASE_URL}/rest/v1/ripples?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (!dbRes.ok) throw new Error(`Supabase error: ${dbRes.status}`);
    const rows = await dbRes.json();
    const ripple = rows?.[0];
    if (!ripple) return res.status(404).json({ error: 'Ripple not found.' });

    // Whitelist fields so location/contact data never leaves the server
    const safe = {};
    PUBLIC_FIELDS.forEach(f => { if (f in ripple) safe[f] = ripple[f]; });
    return res.status(200).json(safe);
  } catch (err) {
    console.error('ripple-public error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
};
