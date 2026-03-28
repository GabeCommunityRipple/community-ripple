// api/notify.js
// Called after a new Ripple is created
// Finds all nearby subscribers and sends them the Ripple Alert email

const { sendRippleAlert } = require('./sendRippleAlert.js');

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

  const { ripple_id, service_type, lat, lng, started_by } = req.body;

  if (!ripple_id || !lat || !lng || !service_type) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Get ripple radius from settings
    const settingsRes = await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.ripple_radius_miles`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const settings = await settingsRes.json();
    const radiusMiles = parseFloat(settings?.[0]?.value || '5');

    // 2. Get all subscribers
    const subsRes = await fetch(`${supabaseUrl}/rest/v1/subscribers?select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const subscribers = await subsRes.json();

    // 3. Filter to nearby subscribers only
    const nearby = subscribers.filter(sub => {
      if (!sub.lat || !sub.lng) return false;
      const dist = distanceMiles(lat, lng, sub.lat, sub.lng);
      return dist <= radiusMiles;
    });

    if (nearby.length === 0) {
      return res.status(200).json({ success: true, notified: 0, message: 'No nearby subscribers found.' });
    }

    // 4. Send Ripple Alert email to each nearby subscriber
    let notified = 0;
    for (const sub of nearby) {
      try {
        await sendRippleAlert({
          toEmail: sub.email,
          serviceType: service_type,
          rippleUrl: `https://communityripple.com/ripple/${ripple_id}`
        });
        notified++;
      } catch (emailErr) {
        console.error(`Failed to notify ${sub.email}:`, emailErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      notified,
      radius_miles: radiusMiles,
      message: `Notified ${notified} neighbors within ${radiusMiles} miles.`
    });

  } catch (err) {
    console.error('Notify error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
