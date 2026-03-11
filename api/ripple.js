// ripple.js v3 — uses Supabase REST API directly, no npm package needed

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

// Helper to call Supabase REST API
async function db(table, options = {}) {
  const { method = 'GET', filter = '', body = null, prefer = '' } = options;
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter}`;
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': prefer || (method === 'POST' ? 'return=representation' : '')
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  if (method === 'GET' || prefer.includes('return=representation')) {
    return await res.json();
  }
  return null;
}

// Haversine formula — straight line distance between two coordinates
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, zip, service, lat, lng } = req.body;

  if (!email || !lat || !lng || !service) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    // 1. Get ripple radius from settings
    const settings = await db('settings', { filter: '?key=eq.ripple_radius_miles' });
    const radiusMiles = parseFloat(settings?.[0]?.value || '5');

    // 2. Save or update subscriber
    const subscribers = await db('subscribers', {
      method: 'POST',
      body: { email, zip, lat, lng, service_interest: service },
      prefer: 'return=representation,resolution=merge-duplicates'
    });
    const subscriber = subscribers?.[0];

    // 3. Find open ripples nearby for same service
    const openRipples = await db('ripples', {
      filter: `?status=eq.open&service_type=ilike.*${encodeURIComponent(service)}*`
    });

    let matchedRipple = null;
    if (Array.isArray(openRipples)) {
      for (const ripple of openRipples) {
        const dist = distanceMiles(lat, lng, ripple.lat, ripple.lng);
        if (dist <= radiusMiles) {
          matchedRipple = ripple;
          break;
        }
      }
    }

    // 4. Join existing or start new ripple
    if (matchedRipple) {
      await db('ripple_members', {
        method: 'POST',
        body: { ripple_id: matchedRipple.id, subscriber_id: subscriber?.id }
      });
      await db(`ripples?id=eq.${matchedRipple.id}`, {
        method: 'PATCH',
        body: { member_count: matchedRipple.member_count + 1 }
      });
      return res.status(200).json({
        status: 'joined',
        ripple_id: matchedRipple.id,
        member_count: matchedRipple.member_count + 1,
        message: `You joined a Ripple with ${matchedRipple.member_count + 1} neighbors!`
      });
    } else {
      const newRipples = await db('ripples', {
        method: 'POST',
        body: { service_type: service, lat, lng, zip, member_count: 1 },
        prefer: 'return=representation'
      });
      const newRipple = newRipples?.[0];
      await db('ripple_members', {
        method: 'POST',
        body: { ripple_id: newRipple?.id, subscriber_id: subscriber?.id }
      });
      return res.status(200).json({
        status: 'created',
        ripple_id: newRipple?.id,
        member_count: 1,
        message: `You started a new Ripple! Notifying neighbors within ${radiusMiles} miles.`
      });
    }

  } catch (err) {
    console.error('Ripple error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
