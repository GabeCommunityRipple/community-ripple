import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Haversine formula — calculates straight-line distance between two coordinates
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8; // Earth radius in miles
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
    // 1. Get the current ripple radius from settings
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'ripple_radius_miles')
      .single();

    const radiusMiles = parseFloat(setting?.value || '5');

    // 2. Save or update subscriber in database
    const { data: subscriber } = await supabase
      .from('subscribers')
      .upsert({ email, zip, lat, lng, service_interest: service }, { onConflict: 'email' })
      .select()
      .single();

    // 3. Look for an open ripple nearby for the same service
    const { data: openRipples } = await supabase
      .from('ripples')
      .select('*')
      .eq('status', 'open')
      .ilike('service_type', `%${service}%`);

    let matchedRipple = null;
    if (openRipples) {
      for (const ripple of openRipples) {
        const dist = distanceMiles(lat, lng, ripple.lat, ripple.lng);
        if (dist <= radiusMiles) {
          matchedRipple = ripple;
          break;
        }
      }
    }

    // 4. Join existing ripple or start a new one
    if (matchedRipple) {
      // Join existing ripple
      await supabase.from('ripple_members').insert({
        ripple_id: matchedRipple.id,
        subscriber_id: subscriber.id
      });

      await supabase
        .from('ripples')
        .update({ member_count: matchedRipple.member_count + 1 })
        .eq('id', matchedRipple.id);

      return res.status(200).json({
        status: 'joined',
        ripple_id: matchedRipple.id,
        member_count: matchedRipple.member_count + 1,
        message: `You joined an existing Ripple with ${matchedRipple.member_count + 1} neighbors!`
      });

    } else {
      // Start a new ripple
      const { data: newRipple } = await supabase
        .from('ripples')
        .insert({ service_type: service, lat, lng, zip, member_count: 1 })
        .select()
        .single();

      await supabase.from('ripple_members').insert({
        ripple_id: newRipple.id,
        subscriber_id: subscriber.id
      });

      return res.status(200).json({
        status: 'created',
        ripple_id: newRipple.id,
        member_count: 1,
        message: `You started a new Ripple! We'll notify neighbors within ${radiusMiles} miles.`
      });
    }

  } catch (err) {
    console.error('Ripple error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
