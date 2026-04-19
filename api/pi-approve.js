// api/pi-approve.js
// Approbation paiement Pi Network — don OU abonnement Premium
// POST { paymentId, payment: { identifier }, metadata? }
//
// metadata.type peut être :
//   'donation'          → don classique (comportement existant)
//   'subscription'      → abonnement Premium (nouveau)
//   'subscription_annual' → abonnement annuel (nouveau)

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const paymentId = req.body?.paymentId || req.body?.payment?.identifier;
  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  try {
    // Approuver le paiement auprès de Pi Network
    const piRes = await fetch(`${PI_API}/payments/${paymentId}/approve`, {
      method:  'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type':  'application/json',
      },
    });

    if (!piRes.ok) {
      const err = await piRes.text();
      console.error('[pi-approve] Pi API error:', piRes.status, err);
      return res.status(piRes.status).json({ error: 'Pi approval failed', details: err });
    }

    const data = await piRes.json();
    return res.status(200).json({ ok: true, paymentId, data });

  } catch (e) {
    console.error('[pi-approve]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
