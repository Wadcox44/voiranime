/**
 * /api/pi-approve.js — Approbation de paiement Pi Network
 * 
 * Appelé par le client quand Pi SDK déclenche onReadyForServerApproval.
 * La clé API Pi reste côté serveur, invisible du frontend.
 * 
 * Variables d'environnement requises :
 *   PI_APP_API_KEY — clé API du Developer Portal Pi Network
 */

const PI_API = 'https://api.minepi.com/v2';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.PI_APP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Pi API key not configured' });
  }

  const { paymentId } = req.body;
  if (!paymentId) {
    return res.status(400).json({ error: 'Missing paymentId' });
  }

  try {
    const piRes = await fetch(`${PI_API}/payments/${paymentId}/approve`, {
      method:  'POST',
      headers: {
        Authorization:  `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await piRes.json();

    if (!piRes.ok) {
      console.error('[Pi Approve] Error:', piRes.status, data);
      return res.status(piRes.status).json({ error: data?.error || 'Pi approval failed' });
    }

    return res.status(200).json({ success: true, payment: data });
  } catch (e) {
    console.error('[Pi Approve] Fetch error:', e.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
