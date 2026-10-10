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
        sender: { name: 'TafelPlan', email: 'info@tafelplan.com' },
        subject: 'Je staat op de lijst 🎉',
        htmlContent: `
          <!-- TABELLEN EN bgcolor, GEEN DIVS MET CSS-ACHTERGROND.
               Outlook rendert met de Word-engine: die negeert `background` op
               een div en negeert max-width/margin:auto, dus stond het blok
               niet gecentreerd en bleef de ruimte eromheen wit. Opeenvolgende
               divs krijgen daar bovendien onderlinge ruimte -- dat was de witte
               strook tussen de groene kop en de creme tekst.
               Daarom: een buitenste tabel op 100% met de kleur zowel als
               bgcolor-ATTRIBUUT als in de style, cellpadding/cellspacing/border
               op 0 zodat er geen naden vallen, en een genestelde tabel van
               600px die Outlook wel centreert via align. -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FEFAE0" style="background-color:#FEFAE0;margin:0;padding:0;">
            <tr><td align="center" bgcolor="#FEFAE0" style="background-color:#FEFAE0;padding:0;">
              <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#FEFAE0" style="background-color:#FEFAE0;width:600px;max-width:600px;font-family:Georgia,serif;">
                <tr><td bgcolor="#1B4332" align="center" style="background-color:#1B4332;padding:32px;">
              <span style="color:#ffffff;font-size:28px;">Tafel</span><span style="color:#C9A84C;font-size:28px;">Plan</span>
                </td></tr>
                <tr><td bgcolor="#FEFAE0" style="background-color:#FEFAE0;padding:40px 32px;">
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Hoi!</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Welkom op de wachtlijst van TafelPlan 🎉</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Geen gedoe meer met "wat eten we vanavond?" en boodschappenlijsten die nergens kloppen. TafelPlan is dé Nederlandse app die maaltijdplanning, boodschappenlijst en budgetbewaking samenvoegt in één overzichtelijke app — zodat jij gewoon kunt genieten van rustige weken en volle tafels.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">We zijn bijna klaar. En jij bent er vroeg bij.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">
                Wat je kunt verwachten:<br>
                &rarr; Je krijgt als eerste bericht wanneer TafelPlan live gaat<br>
                &rarr; Als wachtlijstaanmelder betaal je altijd minder dan de lanceringsprijs<br>
                &rarr; Geen spam. Alleen berichten over TafelPlan, en afmelden kan altijd.
              </p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">We kunnen niet wachten om je te laten zien wat we hebben gebouwd.</p>
              <p style="color:#1A1A1A;font-size:16px;line-height:1.8;">Tot snel!<br><br>Team TafelPlan<br>info@tafelplan.com</p>
                </td></tr>
                <!-- De goudlijn als EIGEN RIJ, tussen de tekst en de voet.
                     Hiervoor zat er goud aan de onderkant van de kop en aan de
                     bovenkant van de voet; nu is er een lijn, op de plek uit de
                     Brevo-template. height + line-height + font-size:0 omdat
                     Outlook een cel anders minimaal een regelhoogte geeft. -->
                <tr><td bgcolor="#C9A84C" height="4" style="background-color:#C9A84C;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
                <tr><td bgcolor="#1B4332" align="center" style="background-color:#1B4332;padding:16px;">
              <span style="color:#FEFAE0;font-size:13px;font-style:italic;">Rustige weken. Volle tafels.</span>
                </td></tr>
              </table>
            </td></tr>
          </table>
        `,
      }),
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    return res.status(500).json({ error: 'Serverfout' });
  }
}
