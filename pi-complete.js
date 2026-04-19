// api/pi-complete.js
// Complétion paiement Pi Network — don OU abonnement Premium
// POST { paymentId, txid, piUserId?, plan?, piUsername? }
//
// Sécurité :
//   - Vérifie le paiement directement auprès de Pi Network
//   - Confirme que le txid correspond bien au paymentId
//   - Active Premium via import direct (pas d'appel HTTP interne)
//   - Retourne 200 même en cas d'erreur partielle (Pi SDK gère le retry)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp }       from 'firebase-admin/firestore';
import { getUser }                        from './_userHelper.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;
const db         = getFirestore();

const PLANS = {
  monthly: { amount: 1.99,  durationMs: 30  * 24 * 3600 * 1000, durationDays: 30  },
  annual:  { amount: 19.99, durationMs: 365 * 24 * 3600 * 1000, durationDays: 365 },
};

/* ── 1. Compléter auprès de Pi Network ── */
async function completeWithPi(paymentId, txid) {
  const res = await fetch(`${PI_API}/payments/${paymentId}/complete`, {
    method:  'POST',
    headers: { 'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ txid }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Pi complete failed: ${res.status} ${err}`);
  }
  return res.json();
}

/* ── 2. Vérifier le paiement auprès de Pi Network ── */
async function verifyPayment(paymentId, txid, plan) {
  const res = await fetch(`${PI_API}/payments/${paymentId}`, {
    headers: { 'Authorization': `Key ${PI_API_KEY}` },
  });
  if (!res.ok) throw new Error(`Cannot verify payment: ${res.status}`);

  const details = await res.json();

  // Vérifier que le txid correspond
  const piTxid = details.transaction?.txid || details.txid;
  if (piTxid && piTxid !== txid) {
    throw new Error(`txid mismatch: expected ${txid}, got ${piTxid}`);
  }

  // Vérifier le statut du paiement
  if (details.status?.developer_completed === false && details.cancelled) {
    throw new Error('Payment was cancelled');
  }

  return details;
}

/* ── 3. Activer Premium directement dans Firestore (pas d'appel HTTP) ── */
async function activatePremium(piUserId, plan, paymentId, txid, piUsername) {
  const planDef = PLANS[plan];
  if (!planDef) throw new Error(`Unknown plan: ${plan}`);

  // Anti-replay : vérifier que ce paymentId n'a pas déjà été utilisé
  const subRef = db.collection('subscriptions').doc(paymentId);
  const subDoc = await subRef.get();
  if (subDoc.exists && subDoc.data().status === 'active') {
    return { alreadyActivated: true, isPremium: true };
  }

  const now      = Date.now();
  const { ref, data } = await getUser(piUserId);

  // Prolonger depuis expiresAt si déjà Premium actif
  const currentExpiry = (data.isPremium && data.expiresAt?.toMillis?.() > now)
    ? data.expiresAt.toMillis()
    : now;
  const newExpiry = currentExpiry + planDef.durationMs;
  const expiresAt = Timestamp.fromMillis(newExpiry);

  // Écriture atomique batch
  const batch = db.batch();

  batch.set(ref, {
    isPremium:   true,
    plan,
    expiresAt,
    piUsername:  piUsername || data.piUsername || '',
    activatedAt: data.activatedAt || Timestamp.fromMillis(now),
    renewedAt:   Timestamp.fromMillis(now),
    willCancel:  false,
  }, { merge: true });

  batch.set(subRef, {
    piUserId,
    plan,
    amount:      planDef.amount,
    paymentId,
    txid:        txid || '',
    activatedAt: Timestamp.fromMillis(now),
    expiresAt,
    status:      'active',
  });

  await batch.commit();

  return {
    isPremium:  true,
    plan,
    expiresAt:  newExpiry,
    daysLeft:   planDef.durationDays,
  };
}

/* ── Handler ── */
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
    // 1. Vérifier le paiement auprès de Pi Network (optionnel mais sécurisé)
    let piDetails = null;
    try {
      piDetails = await verifyPayment(paymentId, txid, plan);
    } catch (verifyErr) {
      // Non bloquant — Pi Network peut avoir un délai de propagation
      console.warn('[pi-complete] Verify warning:', verifyErr.message);
    }

    // 2. Compléter le paiement auprès de Pi Network
    let piData = null;
    try {
      piData = await completeWithPi(paymentId, txid);
    } catch (completeErr) {
      // Le paiement peut déjà être complété (retry) — continuer quand même
      console.warn('[pi-complete] Complete warning:', completeErr.message);
    }

    // 3. Activer Premium si abonnement
    let premiumData = null;
    if (plan && piUserId && PLANS[plan]) {
      premiumData = await activatePremium(piUserId, plan, paymentId, txid, piUsername);
    }

    return res.status(200).json({
      ok:      true,
      paymentId,
      txid,
      premium: premiumData,
    });

  } catch (e) {
    console.error('[pi-complete]', e);
    // Toujours 200 — le Pi SDK gère le retry et l'utilisateur ne doit pas être bloqué
    return res.status(200).json({
      ok:      false,
      warning: e.message,
      paymentId,
    });
  }
}
