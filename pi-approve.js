// api/pi-approve.js
// Approbation paiement Pi Network — don OU abonnement Premium
// POST { paymentId, plan? }
//
// Sécurité :
//   - Récupère les détails du paiement depuis Pi Network AVANT d'approuver
//   - Vérifie que le montant correspond au plan déclaré
//   - Refuse si montant insuffisant (empêche activation Premium à prix réduit)

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;

// Plans côté serveur — source de vérité unique (identique à PLANS dans premium.js)
const PLAN_AMOUNTS = {
  monthly: 1.99,
  annual:  19.99,
};
const TOLERANCE = 0.001; // tolérance flottants Pi

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const paymentId = req.body?.paymentId || req.body?.payment?.identifier;
  const plan      = req.body?.plan || null;

  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  try {
    // 1. Récupérer les détails du paiement depuis Pi Network
    const detailRes = await fetch(`${PI_API}/payments/${paymentId}`, {
      headers: { 'Authorization': `Key ${PI_API_KEY}` },
    });

    if (!detailRes.ok) {
      const err = await detailRes.text();
      console.error('[pi-approve] Cannot fetch payment details:', detailRes.status, err);
      return res.status(detailRes.status).json({ error: 'Cannot verify payment', details: err });
    }

    const paymentDetails = await detailRes.json();

    // 2. Vérifier le montant si c'est un abonnement
    if (plan && PLAN_AMOUNTS[plan] !== undefined) {
      const expected = PLAN_AMOUNTS[plan];
      const actual   = paymentDetails.amount ?? paymentDetails.payment?.amount;

      if (actual === undefined || actual === null) {
        return res.status(400).json({ error: 'Cannot verify payment amount' });
      }

      if (Math.abs(actual - expected) > TOLERANCE) {
        console.error(`[pi-approve] Amount mismatch: expected ${expected}, got ${actual}`);
        return res.status(400).json({
          error:   'AMOUNT_MISMATCH',
          expected, actual,
          message: `Payment amount ${actual} Pi does not match plan ${plan} (${expected} Pi)`,
        });
      }
    }

    // 3. Approuver le paiement auprès de Pi Network
    const approveRes = await fetch(`${PI_API}/payments/${paymentId}/approve`, {
      method:  'POST',
      headers: { 'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
    });

    if (!approveRes.ok) {
      const err = await approveRes.text();
      console.error('[pi-approve] Approval failed:', approveRes.status, err);
      return res.status(approveRes.status).json({ error: 'Pi approval failed', details: err });
    }

    const data = await approveRes.json();
    return res.status(200).json({ ok: true, paymentId, plan, data });

  } catch (e) {
    console.error('[pi-approve]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
