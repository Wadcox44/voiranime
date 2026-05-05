// api/pi-complete.js
// Completion paiement Pi + activation Premium avec retry 3x + idempotency
// POST { paymentId, txid, plan?, piUserId?, piUsername? }

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;
const BASE_URL   = 'https://voir-anime.vercel.app';

// ── Firebase init ────────────────────────────────────────────────────────────
function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

// ── Step 1 : completion Pi Network ──────────────────────────────────────────
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

// ── Step 2 : activation Premium avec retry ───────────────────────────────────
const MAX_ATTEMPTS  = 3;
const RETRY_DELAY   = 800; // ms entre chaque tentative

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function activatePremiumWithRetry(piUserId, plan, paymentId, txid, piUsername) {
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/premium`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'activate', piUserId, plan, paymentId, txid, piUsername }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const data = await res.json();
      if (!data.ok && !data.isPremium && !data.premium?.isPremium) {
        throw new Error(`Activation returned ok=false: ${JSON.stringify(data)}`);
      }

      return { success: true, data, attempts: attempt };

    } catch (err) {
      lastError = err;
      console.error(`[pi-complete] activation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err.message);
      if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY * attempt); // délai croissant
    }
  }

  return { success: false, error: lastError?.message, attempts: MAX_ATTEMPTS };
}

// ── Helpers Firestore ────────────────────────────────────────────────────────
async function updateTransaction(paymentId, fields) {
  try {
    initFirebase();
    const db = getFirestore();
    await db.collection('transactions').doc(paymentId).set(fields, { merge: true });
  } catch (e) {
    console.error('[pi-complete] Firestore update failed:', e.message);
  }
}

// ── Idempotency : vérifier si déjà activé ────────────────────────────────────
async function isAlreadyActivated(paymentId) {
  try {
    initFirebase();
    const db  = getFirestore();
    const doc = await db.collection('transactions').doc(paymentId).get();
    if (!doc.exists) return false;
    return doc.data().status === 'activated';
  } catch (e) {
    console.error('[pi-complete] idempotency check failed:', e.message);
    return false; // en cas d'erreur DB, on continue (mieux activer 2x que 0x)
  }
}

// ── Handler principal ────────────────────────────────────────────────────────
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
    return res.status(400).json({
      error: 'paymentId and txid required',
      // Renvoyer ce qu'on a reçu pour diagnostic
      received: { paymentId: !!paymentId, txid: !!txid },
    });
  }

  // ── 1. Idempotency : déjà activé ? ────────────────────────────────────────
  const alreadyDone = await isAlreadyActivated(paymentId);
  if (alreadyDone) {
    console.log(`[pi-complete] payment ${paymentId} already activated — skipping`);
    return res.status(200).json({ ok: true, paymentId, txid, idempotent: true });
  }

  // ── 2. Completion Pi Network ───────────────────────────────────────────────
  let piData;
  try {
    piData = await completeWithPi(paymentId, txid);
  } catch (e) {
    console.error('[pi-complete] Pi complete error:', e.message);
    // Mettre à jour le statut pour traçabilité (la blockchain a peut-être validé)
    await updateTransaction(paymentId, {
      status:  'pi_complete_error',
      error:   e.message,
      txid,
      piUserId: piUserId || null,
      plan:     plan     || null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return res.status(200).json({
      ok:        false,
      warning:   'Pi Network completion failed',
      error:     e.message,
      // Données de preuve pour l'utilisateur
      paymentId,
      txid,
      piUserId:  piUserId  || null,
      plan:      plan      || null,
      message:   'Contacte le support avec ces informations si tu as été débité.',
    });
  }

  // ── 3. Marquer transaction comme "pi_completed" ───────────────────────────
  await updateTransaction(paymentId, {
    status:      'pi_completed',
    txid,
    piUserId:    piUserId   || null,
    plan:        plan       || null,
    piUsername:  piUsername || null,
    completedAt: FieldValue.serverTimestamp(),
    updatedAt:   FieldValue.serverTimestamp(),
    error:       null,
  });

  // ── 4. Activation Premium (si applicable) ─────────────────────────────────
  const isPremiumPayment = plan && piUserId && (plan === 'monthly' || plan === 'annual');
  let premiumResult = null;

  if (isPremiumPayment) {
    premiumResult = await activatePremiumWithRetry(piUserId, plan, paymentId, txid, piUsername);

    if (premiumResult.success) {
      // ✅ Succès — marquer comme activé
      await updateTransaction(paymentId, {
        status:      'activated',
        attempts:    premiumResult.attempts,
        activatedAt: FieldValue.serverTimestamp(),
        updatedAt:   FieldValue.serverTimestamp(),
        error:       null,
      });
    } else {
      // ❌ Échec après 3 tentatives — statut "paid_not_activated" pour la réparation
      await updateTransaction(paymentId, {
        status:    'paid_not_activated',
        attempts:  premiumResult.attempts,
        error:     premiumResult.error,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.error(`[pi-complete] PAID_NOT_ACTIVATED paymentId=${paymentId} piUserId=${piUserId} plan=${plan}`);

      // Répondre 200 avec toutes les infos de preuve — le paiement Pi est confirmé
      return res.status(200).json({
        ok:           false,
        warning:      'Payment confirmed on blockchain but Premium activation failed',
        paymentId,
        txid,
        piUserId,
        plan,
        attempts:     premiumResult.attempts,
        error:        premiumResult.error,
        message:      'Ton paiement est confirmé. Le Premium sera activé dans les prochaines minutes ou contacte le support.',
      });
    }
  }

  return res.status(200).json({
    ok:        true,
    paymentId,
    txid,
    piData,
    premium:   premiumResult?.data || null,
  });
}
