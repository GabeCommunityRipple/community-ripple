export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, address, ripple_id } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!address) return res.status(400).json({ error: 'Address is required.' });
  if (!ripple_id) return res.status(400).json({ error: 'Ripple ID is required.' });

  const brevoKey = process.env.BREVO_API_KEY;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  try {
    // 1. Geocode the address
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`);
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || !geoData.results?.[0]) {
      return res.status(400).json({ error: 'Address not found. Please check and try again.' });
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const formattedAddress = geoData.results[0].formatted_address;
    const zipComponent = geoData.results[0].address_components.find(c => c.types.includes('postal_code'));
    const zip = zipComponent?.short_name || '';

    // 2. Fetch the ripple to confirm it exists and is open
    const rippleRes = await fetch(`${supabaseUrl}/rest/v1/ripples?id=eq.${ripple_id}&select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const rippleData = await rippleRes.json();
    const ripple = rippleData?.[0];

    if (!ripple) return res.status(404).json({ error: 'Ripple not found.' });
    if (ripple.status !== 'open') return res.status(400).json({ error: 'This Ripple is no longer active.' });

    // 3. Check distance — must be within radius
    const settingsRes = await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.ripple_radius_miles`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const settings = await settingsRes.json();
    const radiusMiles = parseFloat(settings?.[0]?.value || '5');
    const dist = haversine(lat, lng, ripple.lat, ripple.lng);

    if (dist > radiusMiles) {
      return res.status(400).json({ error: `Your address is ${dist.toFixed(1)} miles from this Ripple. You must be within ${radiusMiles} miles to join.` });
    }

    // 4. Save to Brevo
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
      body: JSON.stringify({
        email,
        listIds: [2],
        updateEnabled: true,
        attributes: {
          ZIP_CODE: zip,
          SERVICE_INTEREST: ripple.service_type || 'Not specified',
          ADDRESS: formattedAddress,
          LAT: lat.toString(),
          LNG: lng.toString()
        }
      })
    });

    // 5. Upsert subscriber in Supabase
    await fetch(`${supabaseUrl}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ email, zip, lat, lng, address: formattedAddress, service_interest: ripple.service_type || 'Not specified' })
    });

    // 6. Fetch subscriber ID
    const lookupRes = await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}&select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const lookupData = await lookupRes.json();
    const subscriber = lookupData?.[0];

    if (!subscriber?.id) {
      return res.status(500).json({ error: 'Could not find subscriber record.' });
    }

    // 7. Check if already a member
    const memberCheckRes = await fetch(`${supabaseUrl}/rest/v1/ripple_members?ripple_id=eq.${ripple_id}&subscriber_id=eq.${subscriber.id}`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const existingMember = await memberCheckRes.json();

    if (existingMember?.length > 0) {
      return res.status(200).json({ success: true, already_member: true, ripple_id });
    }

    // 8. Add to ripple_members
    await fetch(`${supabaseUrl}/rest/v1/ripple_members`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ripple_id, subscriber_id: subscriber.id })
    });

    // 9. Increment member count
    await fetch(`${supabaseUrl}/rest/v1/ripples?id=eq.${ripple_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ member_count: ripple.member_count + 1 })
    });

    console.log(`${email} joined ripple ${ripple_id}`);

    return res.status(200).json({ success: true, ripple_id });

  } catch (err) {
    console.error('Join error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
