export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, zip, service } = req.body;

  if (!email || !zip) {
    return res.status(400).json({ error: 'Email and ZIP code are required.' });
  }

  const response = await fetch('https://api.brevo.com/v3/contacts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': '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'
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

  if (response.status === 201 || response.status === 204) {
    return res.status(200).json({ success: true });
  }

  const data = await response.json();
  return res.status(500).json({ error: data.message || 'Brevo error' });
}
