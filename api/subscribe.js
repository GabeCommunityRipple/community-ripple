  // api/subscribe.js v2
// Vercel serverless function — runs on the server, never exposed to the browser
// Your Brevo API key is stored safely in Vercel environment variables

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, zip, service } = req.body;

  // Basic validation
  if (!email || !zip) {
    return res.status(400).json({ error: 'Email and ZIP code are required.' });
  }
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Please enter a valid 5-digit ZIP code.' });
  }

  // Check the key is actually loaded
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server config error: API key not set in Vercel environment variables.' });
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        email: email,
        listIds: [2],
        updateEnabled: true,
        attributes: {
          ZIP_CODE: zip,
          SERVICE_INTEREST: service || 'Not specified'
        }
      })
    });

    // 201 = new contact created, 204 = existing contact updated
    if (response.status === 201 || response.status === 204) {
      return res.status(200).json({ success: true });
    }

    // Return full Brevo error so we can see exactly what went wrong
    const data = await response.json();
    console.error('Brevo rejected:', response.status, JSON.stringify(data));
    return res.status(500).json({
      error: data.message || 'Brevo error',
      detail: JSON.stringify(data)
    });

  } catch (err) {
    console.error('Brevo subscribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
