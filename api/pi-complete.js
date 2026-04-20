// api/pi-complete.js
// Complétion paiement Pi Network — don OU abonnement Premium
// POST { paymentId, txid, payment: {...}, piUserId?, plan? }
//
// Si plan est fourni (monthly|annual) → active Premium via api/premium.js actionActivate
// Sinon → don classique (pas d'activation Premium)

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;

async function completeWithPi(paymentId, txid) {
  const res = await fetch(`${PI_API}/payments/${paymentId}/complete`, {
    method:  'POST',
    headers: {
      'Authorization': `Key ${PI_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ txid }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pi complete failed: ${res.status} ${err}`);
  }
  return res.json();
}

async function activatePremium(piUserId, plan, paymentId, txid, piUsername) {
  const baseUrl = 'https://voir-anime.vercel.app'; // URL fixe, pas VERCEL_URL

  const res = await fetch(`${baseUrl}/api/premium`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      action: 'activate',
      piUserId,
      plan,
      paymentId,
      txid,
      piUsername,
    }),
  });

  if (!res.ok) throw new Error(`Premium activation failed: ${res.status}`);
  return res.json();
}

  if (!res.ok) throw new Error(`Premium activation failed: ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const {
    paymentId: bodyPaymentId,
    txid:      bodyTxid,
    payment,
    piUserId,
    plan,
    piUsername,
  } = req.body || {};

  const paymentId = bodyPaymentId || payment?.identifier;
  const txid      = bodyTxid      || payment?.transaction?.txid;

  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'paymentId and txid required' });
  }

  try {
    // 1. Compléter le paiement auprès de Pi Network
    const piData = await completeWithPi(paymentId, txid);

    // 2. Si c'est un abonnement → activer Premium
    let premiumData = null;
    if (plan && piUserId && (plan === 'monthly' || plan === 'annual')) {
      premiumData = await activatePremium(piUserId, plan, paymentId, txid, piUsername);
    }

    return res.status(200).json({
      ok:        true,
      paymentId,
      txid,
      piData,
      premium:   premiumData,
    });

  } catch (e) {
    console.error('[pi-complete]', e);
    // Même si la complétion Pi échoue côté serveur, le txid peut déjà être confirmé
    // On retourne 200 pour ne pas bloquer l'utilisateur (Pi SDK gère le retry)
    return res.status(200).json({
      ok:      false,
      warning: e.message,
      paymentId,
    });
  }
}
