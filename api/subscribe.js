// api/subscribe.js
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

  try {
    const response = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': process.env.BREVO_API_KEY   // ← secure, never visible to users
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

    const data = await response.json();
    throw new Error(data.message || 'Brevo error');

  } catch (err) {
    console.error('Brevo subscribe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
