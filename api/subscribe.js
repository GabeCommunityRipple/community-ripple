export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, address, service } = req.body;

  if (!email) return res.status(400).json({ error: 'Email is required.' });
  if (!address) return res.status(400).json({ error: 'Address is required.' });

  const brevoKey = process.env.BREVO_API_KEY;
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!brevoKey) return res.status(500).json({ error: 'Brevo API key not configured.' });
  if (!googleKey) return res.status(500).json({ error: 'Google Maps API key not configured.' });

  try {
    // 1. Convert address to lat/lng
    const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`);
    const geoData = await geoRes.json();

    if (geoData.status !== 'OK' || !geoData.results?.[0]) {
      return res.status(400).json({ error: 'Address not found. Please check and try again.' });
    }

    const { lat, lng } = geoData.results[0].geometry.location;
    const formattedAddress = geoData.results[0].formatted_address;

    // Extract ZIP from Google result
    const zipComponent = geoData.results[0].address_components.find(c => c.types.includes('postal_code'));
    const zip = zipComponent?.short_name || '';

    // 2. Save to Brevo
    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': brevoKey },
      body: JSON.stringify({
        email,
        listIds: [2],
        updateEnabled: true,
        attributes: {
          ZIP_CODE: zip,
          SERVICE_INTEREST: service || 'Not specified',
          ADDRESS: formattedAddress,
          LAT: lat.toString(),
          LNG: lng.toString()
        }
      })
    });

    if (brevoRes.status !== 201 && brevoRes.status !== 204) {
      const brevoData = await brevoRes.json();
      throw new Error(brevoData.message || 'Brevo error');
    }

    // 3. Save to Supabase
    if (supabaseUrl && supabaseKey) {
      await fetch(`${supabaseUrl}/rest/v1/subscribers`, {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ email, zip, lat, lng, service_interest: service || 'Not specified' })
      });
    }

    return res.status(200).json({ success: true, lat, lng, formatted_address: formattedAddress });

  } catch (err) {
    console.error('Subscribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
