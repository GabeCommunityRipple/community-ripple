const { sendRippleAlert } = require('./sendRippleAlert.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, address, service, recaptcha_token } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!address) return res.status(400).json({ error: 'Address is required.' });

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;

  if (!googleKey) return res.status(500).json({ error: 'Google Maps API key not configured.' });

  try {
    let rippleId = null;

    // 1. Verify reCAPTCHA token
    if (recaptchaSecret && recaptcha_token) {
      const captchaRes = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${recaptchaSecret}&response=${recaptcha_token}`
      });
      const captchaData = await captchaRes.json();
      const score = captchaData?.score ?? 1;
      console.log('reCAPTCHA score:', score);
      if (score < 0.5) {
        return res.status(400).json({ error: 'Spam detected. Please try again.' });
      }
    }

    // 2. Convert address to lat/lng
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`);
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || !geoData.results?.[0]) {
      return res.status(400).json({ error: 'Address not found. Please check and try again.' });
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const formattedAddress = geoData.results[0].formatted_address;
    const zipComponent = geoData.results[0].address_components.find(c => c.types.includes('postal_code'));
    const zip = zipComponent?.short_name || '';

    // 3. Save to Supabase
    await fetch(`${supabaseUrl}/rest/v1/subscribers`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ email, zip, lat, lng, address: formattedAddress, service_interest: service || 'Not specified' })
    });

    // Fetch subscriber by email to get their ID
    const lookupRes = await fetch(`${supabaseUrl}/rest/v1/subscribers?email=eq.${encodeURIComponent(email)}&select=*`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const lookupData = await lookupRes.json();
    const subscriber = lookupData?.[0];

    console.log('Subscriber found:', subscriber?.id, subscriber?.email);

    // 5. Ripple matching
    if (service && subscriber?.id) {
      const settingsRes = await fetch(`${supabaseUrl}/rest/v1/settings?key=eq.ripple_radius_miles`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const settings = await settingsRes.json();
      const radiusMiles = parseFloat(settings?.[0]?.value || '5');

      const ripplesRes = await fetch(`${supabaseUrl}/rest/v1/ripples?status=eq.open&select=*`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const openRipples = await ripplesRes.json();

      let matchedRipple = null;
      if (Array.isArray(openRipples)) {
        for (const ripple of openRipples) {
          if (!ripple.lat || !ripple.lng) continue;
          const sameService = ripple.service_type?.toLowerCase().includes(service.toLowerCase()) ||
                              service.toLowerCase().includes(ripple.service_type?.toLowerCase());
          if (!sameService) continue;
          const dist = haversine(lat, lng, ripple.lat, ripple.lng);
          if (dist <= radiusMiles) {
            matchedRipple = ripple;
            break;
          }
        }
      }

      if (matchedRipple) {
        rippleId = matchedRipple.id;
        await fetch(`${supabaseUrl}/rest/v1/ripple_members`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ripple_id: matchedRipple.id, subscriber_id: subscriber.id })
        });
        await fetch(`${supabaseUrl}/rest/v1/ripples?id=eq.${matchedRipple.id}`, {
          method: 'PATCH',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ member_count: matchedRipple.member_count + 1 })
        });

      } else {
        const newRippleRes = await fetch(`${supabaseUrl}/rest/v1/ripples`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ service_type: service, lat, lng, zip, member_count: 1, status: 'open' })
        });
        const newRippleData = await newRippleRes.json();
        const newRipple = Array.isArray(newRippleData) ? newRippleData[0] : newRippleData;

        if (newRipple?.id) {
          rippleId = newRipple.id;
          await fetch(`${supabaseUrl}/rest/v1/ripple_members`, {
            method: 'POST',
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ripple_id: newRipple.id, subscriber_id: subscriber.id })
          });

          const allSubsRes = await fetch(`${supabaseUrl}/rest/v1/subscribers?select=*`, {
            headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
          });
          const allSubs = await allSubsRes.json();
          const nearby = Array.isArray(allSubs) ? allSubs.filter(sub => {
            if (sub.email === email || !sub.lat || !sub.lng) return false;
            return haversine(lat, lng, sub.lat, sub.lng) <= radiusMiles;
          }) : [];

          for (const sub of nearby) {
            await sendRippleAlert({
              toEmail: sub.email,
              serviceType: service,
              rippleUrl: `https://communityripple.com/ripple/${newRipple.id}`
            });
          }
        }
      }
    } else {
      console.log('Skipping ripple — service:', service, 'subscriber id:', subscriber?.id);
    }

    if (service && rippleId) {
      await sendRippleAlert({
        toEmail: email,
        serviceType: service,
        rippleUrl: `https://communityripple.com/ripple/${rippleId}`
      });
    }

    return res.status(200).json({ success: true, lat, lng, formatted_address: formattedAddress, ripple_id: rippleId });

  } catch (err) {
    console.error('Subscribe error:', err.message);
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
