// api/admin.js — v2
// Endpoint admin unique — toutes les actions sur users et paiements
// POST { action, ...params }
// Auth : header Authorization: Bearer <ADMIN_SECRET>
//
// Actions disponibles :
//   user_list         → liste users avec filtre optionnel
//   user_get          → détail complet d'un user
//   user_block        → bloquer un user
//   user_unblock      → débloquer
//   user_premium_set  → activer/désactiver Premium manuellement
//   user_reset_stats  → marquer reset (localStorage effacé côté client)
//   user_feature_flag → activer/désactiver un flag pour un user
//   payment_list      → historique paiements avec filtre status
//   payment_repair    → relancer activation d'un payment
//   payment_refund_log→ enregistrer remboursement manuel
//   test_premium      → simuler Premium (mode test)
//   admin_reset       → reset compte admin test

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const BASE_URL     = 'https://voir-anime.vercel.app';

function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

// ── Extraction du secret ─────────────────────────────────────────────────────
function getSecret(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // fallback body (legacy — à supprimer dans 1 mois)
  return req.body?.secret || '';
}

// ── Logger actions critiques ──────────────────────────────────────────────────
async function logAction(db, action, params, result) {
  try {
    await db.collection('logs').add({
      type:      'admin_action',
      action,
      params:    JSON.stringify(params),
      result:    JSON.stringify(result).slice(0, 500),
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch(e) {}
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const secret = getSecret(req);
  if (!secret || secret !== ADMIN_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  const { action, ...params } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    initFirebase();
    const db = getFirestore();
    let result;

    // ── USERS ────────────────────────────────────────────────────────────────
    if (action === 'user_list') {
      const { limit = 50, onlyPremium, onlyBlocked } = params;
      let q = db.collection('users').limit(Number(limit));
      if (onlyPremium) q = db.collection('users').where('isPremium', '==', true).limit(Number(limit));
      if (onlyBlocked) q = db.collection('users').where('blocked',   '==', true).limit(Number(limit));
      const snap = await q.get();
      result = snap.docs.map(d => ({
        id: d.id,
        ...pick(d.data(), [
          'isPremium','plan','expiresAt','blocked',
          'piUsername','activatedAt','createdAt','churnedAt',
        ]),
      }));
    }

    else if (action === 'user_get') {
      const { piUserId } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      const doc = await db.collection('users').doc(piUserId).get();
      if (!doc.exists) return res.status(404).json({ error: 'User not found' });
      const txSnap = await db.collection('transactions')
        .where('piUserId', '==', piUserId)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      result = {
        user:     doc.data(),
        payments: txSnap.docs.map(d => ({ id: d.id, ...d.data() })),
      };
    }

    else if (action === 'user_block') {
      const { piUserId, reason } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      await db.collection('users').doc(piUserId).set(
        { blocked: true, blockedAt: FieldValue.serverTimestamp(), blockReason: reason || '' },
        { merge: true }
      );
      result = { ok: true, piUserId, blocked: true };
    }

    else if (action === 'user_unblock') {
      const { piUserId } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      await db.collection('users').doc(piUserId).set(
        { blocked: false, blockReason: null },
        { merge: true }
      );
      result = { ok: true, piUserId, blocked: false };
    }

    else if (action === 'user_premium_set') {
      const { piUserId, enable, plan = 'monthly', days = 30 } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });

      const expiresAt = enable
        ? Timestamp.fromMillis(Date.now() + Number(days) * 86400000)
        : null;

      // Récupérer plan actuel pour historique
      const userDoc = await db.collection('users').doc(piUserId).get();
      const currentPlan = userDoc.exists ? userDoc.data().plan : null;
      const planHistoryEntry = enable && currentPlan && currentPlan !== plan
        ? { plan, changedAt: Timestamp.now() }
        : null;

      const update = {
        isPremium:      !!enable,
        plan:           enable ? plan : null,
        expiresAt,
        manualOverride: true,
        overrideAt:     FieldValue.serverTimestamp(),
      };

      // Ajouter à l'historique de plan si changement
      if (planHistoryEntry) {
        update.planHistory = FieldValue.arrayUnion(planHistoryEntry);
      }

      // Marquer activation si activation
      if (enable) {
        update.activatedAt  = FieldValue.serverTimestamp();
        update.churnedAt    = null;
      } else {
        // Désactivation manuelle = churn
        update.churnedAt    = FieldValue.serverTimestamp();
        update.churnReason  = 'manual_admin';
      }

      await db.collection('users').doc(piUserId).set(update, { merge: true });
      result = { ok: true, piUserId, isPremium: !!enable, plan: enable ? plan : null };
    }

    else if (action === 'user_reset_stats') {
      const { piUserId } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      await db.collection('users').doc(piUserId).set(
        { resetAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      result = { ok: true, piUserId, note: 'resetAt updated — client clears localStorage on next load' };
    }

    else if (action === 'user_feature_flag') {
      const { piUserId, flag, enable } = params;
      if (!piUserId || !flag) return res.status(400).json({ error: 'piUserId and flag required' });
      await db.collection('users').doc(piUserId).set(
        { [`flags.${flag}`]: !!enable },
        { merge: true }
      );
      result = { ok: true, piUserId, flag, enabled: !!enable };
    }

    // ── PAIEMENTS ────────────────────────────────────────────────────────────
    else if (action === 'payment_list') {
      const { status, limit = 50, piUserId } = params;
      let q = db.collection('transactions').orderBy('createdAt', 'desc').limit(Number(limit));
      if (status)   q = db.collection('transactions').where('status',   '==', status).orderBy('createdAt','desc').limit(Number(limit));
      if (piUserId) q = db.collection('transactions').where('piUserId', '==', piUserId).orderBy('createdAt','desc').limit(Number(limit));
      const snap = await q.get();
      result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    else if (action === 'payment_repair') {
      const { paymentId } = params;
      const r = await fetch(`${BASE_URL}/api/pi-repair`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${ADMIN_SECRET}`,
        },
        body: JSON.stringify({ paymentId }),
      });
      result = await r.json();
    }

    else if (action === 'payment_refund_log') {
      const { paymentId, piUserId, amount, reason } = params;
      if (!paymentId) return res.status(400).json({ error: 'paymentId required' });
      await db.collection('transactions').doc(paymentId).set(
        {
          status:       'refunded',
          refundedAt:   FieldValue.serverTimestamp(),
          refundReason: reason || '',
          amount:       amount || null,
        },
        { merge: true }
      );
      if (piUserId) {
        await db.collection('users').doc(piUserId).set(
          {
            isPremium:   false,
            plan:        null,
            churnedAt:   FieldValue.serverTimestamp(),
            churnReason: 'refund',
          },
          { merge: true }
        );
      }
      result = { ok: true, paymentId, refunded: true };
    }

    // ── MODE TEST ────────────────────────────────────────────────────────────
    else if (action === 'test_premium') {
      const { piUserId, days = 1 } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      const expiresAt = Timestamp.fromMillis(Date.now() + Number(days) * 86400000);
      await db.collection('users').doc(piUserId).set({
        isPremium: true, plan: 'monthly', expiresAt,
        testMode: true, testSetAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      result = { ok: true, piUserId, testPremium: true, expiresIn: `${days}d` };
    }

    else if (action === 'admin_reset') {
      const { piUserId } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      await db.collection('users').doc(piUserId).set({
        isPremium: false, plan: null, expiresAt: null,
        blocked: false, testMode: false, resetAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      result = { ok: true, piUserId, reset: true };
    }

    else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // Logger les actions critiques
    const CRITICAL = ['user_block','user_unblock','user_premium_set','payment_refund_log','admin_reset'];
    if (CRITICAL.includes(action)) await logAction(db, action, params, result);

    return res.status(200).json({ ok: true, action, result });

  } catch(e) {
    console.error('[admin]', action, e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}

function pick(obj, keys) {
  const r = {};
  keys.forEach(k => { if (obj[k] !== undefined) r[k] = obj[k]; });
  return r;
}
