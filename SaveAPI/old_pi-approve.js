// api/pi-approve.js
// Approbation paiement Pi Network + enregistrement transaction Firestore
// POST { paymentId, plan?, piUserId?, piUsername? }

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';

const PI_API     = 'https://api.minepi.com/v2';
const PI_API_KEY = process.env.PI_APP_API_KEY;

function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { paymentId, plan, piUserId, piUsername } = req.body || {};
  if (!paymentId) return res.status(400).json({ error: 'paymentId required' });

  try {
    // 1. Approuver auprès de Pi Network
    const piRes = await fetch(`${PI_API}/payments/${paymentId}/approve`, {
      method:  'POST',
      headers: { 'Authorization': `Key ${PI_API_KEY}`, 'Content-Type': 'application/json' },
    });

    if (!piRes.ok) {
      const err = await piRes.text();
      console.error('[pi-approve] Pi API error:', piRes.status, err);
      return res.status(piRes.status).json({ error: 'Pi approval failed', details: err });
    }

    const data = await piRes.json();

    // 2. Enregistrer la transaction en Firestore (idempotent via set merge)
    try {
      initFirebase();
      const db = getFirestore();
      await db.collection('transactions').doc(paymentId).set({
        paymentId,
        status:     'pending',
        plan:       plan    || null,
        piUserId:   piUserId   || null,
        piUsername: piUsername || null,
        createdAt:  FieldValue.serverTimestamp(),
        attempts:   0,
        error:      null,
      }, { merge: true }); // merge : ne pas écraser si déjà existant (double-appel)
    } catch (dbErr) {
      // DB non bloquant — le paiement continue même si Firestore échoue ici
      console.error('[pi-approve] Firestore write failed:', dbErr.message);
    }

    return res.status(200).json({ ok: true, paymentId, data });

  } catch (e) {
    console.error('[pi-approve]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
