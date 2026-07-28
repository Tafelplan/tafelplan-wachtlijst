export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }

  try {
    // 1. Opslaan in Brevo
    const brevoResponse = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        email,
        listIds: [3],
        updateEnabled: true,
      }),
    });

    if (brevoResponse.status !== 201 && brevoResponse.status !== 204) {
      const data = await brevoResponse.json();
      console.log('Brevo error:', JSON.stringify(data));
      // Negeer "already exists" fout — e-mailadres staat al in de lijst
      if (!data.message?.includes('already exist')) {
        return res.status(400).json({ error: data.message || 'Brevo aanmelding mislukt' });
      }
    }

    // 2. Opslaan in Supabase
    const supabaseResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/wachtlijst`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ email }),
      }
    );

    if (!supabaseResponse.ok && supabaseResponse.status !== 409) {
      const supabaseData = await supabaseResponse.text();
      console.log('Supabase error:', supabaseData, 'status:', supabaseResponse.status);
      return res.status(500).json({ error: 'Supabase opslag mislukt' });
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: 'Serverfout' });
  }
}
