async function sendRippleAlert({ toEmail, serviceType, rippleUrl }) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('Resend API key not configured.');

  const unsubscribeUrl = `https://communityripple.com/unsubscribe?email=${encodeURIComponent(toEmail)}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>A Ripple just started in your neighborhood</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(26,37,64,0.10);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a2540;padding:28px 40px;text-align:center;">
              <img src="https://communityripple.com/ripple_white_logo.png" alt="Community Ripple" width="180" style="display:block;margin:0 auto;max-width:180px;" />
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="background:linear-gradient(135deg,#5B8DD9 0%,#3DAE4A 100%);padding:36px 40px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.85);">New in your neighborhood</p>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#ffffff;line-height:1.2;">A Ripple just started<br>near you 🌊</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 16px 0;font-size:16px;color:#1a2540;line-height:1.6;">
                A neighbor in your area just started a <strong>${serviceType}</strong> Ripple — a group buy that gets everyone a better price the more people join.
              </p>
              <p style="margin:0 0 28px 0;font-size:16px;color:#1a2540;line-height:1.6;">
                The more neighbors who join, the bigger the discount for everyone. Here's how it works:
              </p>

              <!-- Discount tiers -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;border-radius:10px;overflow:hidden;border:1px solid #e8edf5;">
                <tr style="background-color:#f4f6fb;">
                  <td style="padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5B8DD9;">Homes</td>
                  <td style="padding:10px 16px;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#5B8DD9;">Discount</td>
                </tr>
                <tr style="border-top:1px solid #e8edf5;">
                  <td style="padding:12px 16px;font-size:15px;color:#1a2540;">2–3 homes</td>
                  <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#3DAE4A;">10% off</td>
                </tr>
                <tr style="border-top:1px solid #e8edf5;background-color:#f9fbff;">
                  <td style="padding:12px 16px;font-size:15px;color:#1a2540;">4–5 homes</td>
                  <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#3DAE4A;">18% off</td>
                </tr>
                <tr style="border-top:1px solid #e8edf5;">
                  <td style="padding:12px 16px;font-size:15px;color:#1a2540;">6–8 homes</td>
                  <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#F5A04A;">25% off</td>
                </tr>
                <tr style="border-top:1px solid #e8edf5;background-color:#f9fbff;">
                  <td style="padding:12px 16px;font-size:15px;color:#1a2540;">9+ homes</td>
                  <td style="padding:12px 16px;font-size:15px;font-weight:700;color:#F5A04A;">30% off</td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="${rippleUrl}" style="display:inline-block;background-color:#5B8DD9;color:#ffffff;text-decoration:none;font-size:17px;font-weight:700;padding:16px 40px;border-radius:8px;letter-spacing:0.3px;">Join the Ripple</a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;font-size:14px;color:#7a88a8;line-height:1.6;">
                No commitment yet — joining the Ripple just shows interest. You'll only be contacted when enough neighbors have joined to unlock a discount.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f6fb;padding:24px 40px;text-align:center;border-top:1px solid #e8edf5;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#7a88a8;">
                You're receiving this because you signed up for neighborhood alerts on <a href="https://communityripple.com" style="color:#5B8DD9;text-decoration:none;">communityripple.com</a>.
              </p>
              <p style="margin:0;font-size:13px;color:#7a88a8;">
                <a href="${unsubscribeUrl}" style="color:#7a88a8;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${resendKey}`
    },
    body: JSON.stringify({
      from: 'Community Ripple <neighbors@mail.communityripple.com>',
      to: [toEmail],
      subject: '🌊 A Ripple just started in your neighborhood',
      html
    })
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data?.message || `Resend error: ${res.status}`);
  }

  return res.json();
}

module.exports = { sendRippleAlert };
