export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ongeldig e-mailadres' });
  }

  try {
    // 1. Supabase eerst
    const supabaseResponse = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/wachtlijst`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'resolution=ignore-duplicates',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email }),
      }
    );

    if (!supabaseResponse.ok && supabaseResponse.status !== 409) {
      return res.status(500).json({ error: 'Opslaan mislukt' });
    }

    // 2. Dan Brevo
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
        attributes: {
          OPT_IN: true,
        },
      }),
    });

    if (brevoResponse.status !== 201 && brevoResponse.status !== 204) {
      const data = await brevoResponse.json();
      if (!data.message?.includes('already exist')) {
        return res.status(400).json({ error: 'Aanmelding mislukt' });
      }
    }

    // 3. Bevestigingsmail sturen
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
      },
      body: JSON.stringify({
        to: [{ email }],
        sender: { name: 'Tafelplan', email: 'info@tafelplan.com' },
        subject: 'Je staat op de lijst 🎉',
        htmlContent: `
          <div style="background:#FEFAE0;font-family:Georgia,serif;max-width:600px;margin:0 auto;">
            <div style="background:#1B4332;padding:32px;text-align:center;border-bottom:4px solid #C9A84C;">
              <span style="color:#ffffff;font-size:28px;">Tafel</span><span style="color:#C9A84C;font-size:28px;">Plan</span>
            </div>
            <div style="padding:40px 32px;background:#FEFAE0;">
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Hoi!</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Welkom op de wachtlijst van Tafelplan 🎉</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Geen gedoe meer met "wat eten we vanavond?" en boodschappenlijsten die nergens kloppen. Tafelplan is dé Nederlandse app die maaltijdplanning, boodschappenlijst en budgetbewaking samenvoegt in één overzichtelijke app — zodat jij gewoon kunt genieten van rustige weken en volle tafels.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">We zijn bijna klaar. En jij bent er vroeg bij.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">
                Wat je kunt verwachten:<br>
                &rarr; Je krijgt als eerste bericht wanneer Tafelplan live gaat<br>
                &rarr; Als wachtlijstaanmelder betaal je nooit meer dan &euro;5,99/mnd &mdash; voor altijd<br>
                &rarr; Geen spam. Geen nieuwsbrieven. Eén bericht bij lancering.
              </p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">We kunnen niet wachten om je te laten zien wat we hebben gebouwd.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Tot snel!<br><br>Team Tafelplan<br>info@tafelplan.com</p>
            </div>
            <div style="background:#1B4332;padding:16px;text-align:center;border-top:2px solid #C9A84C;">
              <span style="color:#FEFAE0;font-size:13px;font-style:italic;">Rustige weken. Volle tafels.</span>
            </div>
          </div>
        `,
      }),
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: 'Serverfout' });
  }
}
