// api/pi-repair.js
// Réparation automatique des paiements "paid_not_activated"
// Déclenché par cron Vercel OU manuellement via POST { secret }
//
// vercel.json — ajouter dans "crons" :
//   { "path": "/api/pi-repair", "schedule": "*/15 * * * *" }
//   (toutes les 15 min)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue }      from 'firebase-admin/firestore';

const BASE_URL      = 'https://voir-anime.vercel.app';
const CRON_SECRET   = process.env.CRON_SECRET;
const MAX_REPAIR_ATTEMPTS = 5; // au-delà → 'failed_permanently', alerte manuelle

function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

async function retryActivation(tx) {
  const { paymentId, txid, piUserId, plan, piUsername } = tx;

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
    throw new Error(`Activation returned ok=false`);
  }

  return data;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Auth : cron Vercel (header) OU appel manuel (secret dans body)
  const cronHeader   = req.headers['x-vercel-cron-signature'];
  const manualSecret = req.body?.secret || req.query?.secret;
  const isAuthorized = cronHeader || manualSecret === CRON_SECRET;

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initFirebase();
    const db = getFirestore();

    // Chercher tous les paiements "paid_not_activated" de moins de 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await db.collection('transactions')
      .where('status', '==', 'paid_not_activated')
      .where('updatedAt', '>', cutoff)
      .limit(20)
      .get();

    if (snap.empty) {
      return res.status(200).json({ ok: true, repaired: 0, message: 'Nothing to repair' });
    }

    const results = [];

    for (const doc of snap.docs) {
      const tx         = doc.data();
      const paymentId  = doc.id;
      const attempts   = (tx.attempts || 0) + 1;

      // Trop de tentatives → marquer comme échoué définitivement
      if (attempts > MAX_REPAIR_ATTEMPTS) {
        await doc.ref.update({
          status:    'failed_permanently',
          updatedAt: FieldValue.serverTimestamp(),
          error:     `Exceeded ${MAX_REPAIR_ATTEMPTS} repair attempts`,
        });
        results.push({ paymentId, status: 'failed_permanently' });
        console.error(`[pi-repair] PERMANENTLY_FAILED paymentId=${paymentId} piUserId=${tx.piUserId}`);
        continue;
      }

      try {
        await retryActivation(tx);

        await doc.ref.update({
          status:      'activated',
          attempts,
          activatedAt: FieldValue.serverTimestamp(),
          updatedAt:   FieldValue.serverTimestamp(),
          error:       null,
          repairedBy:  'cron',
        });

        results.push({ paymentId, status: 'activated', attempts });
        console.log(`[pi-repair] REPAIRED paymentId=${paymentId} piUserId=${tx.piUserId}`);

      } catch (err) {
        await doc.ref.update({
          attempts,
          error:     err.message,
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.push({ paymentId, status: 'retry_failed', attempts, error: err.message });
        console.error(`[pi-repair] retry failed paymentId=${paymentId}:`, err.message);
      }
    }

    const repairedCount = results.filter(r => r.status === 'activated').length;
    return res.status(200).json({ ok: true, repaired: repairedCount, total: results.length, results });

  } catch (e) {
    console.error('[pi-repair]', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
