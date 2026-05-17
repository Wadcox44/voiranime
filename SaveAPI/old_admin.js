// api/admin.js
// Endpoint admin unique — toutes les actions sur users et paiements
// POST { secret, action, ...params }
//
// Actions disponibles :
//   user_list         → liste users avec filtre optionnel
//   user_get          → détail complet d'un user
//   user_block        → bloquer un user (bloque l'accès Premium + features)
//   user_unblock      → débloquer
//   user_premium_set  → activer/désactiver Premium manuellement
//   user_reset_stats  → effacer watchStatus, history, ratings
//   user_feature_flag → activer/désactiver un flag pour un user
//   payment_list      → historique paiements avec filtre status
//   payment_repair    → relancer activation d'un payment_id
//   payment_refund_log→ enregistrer remboursement manuel (pas d'API Pi pour ça)
//   test_premium      → simuler Premium (mode test, daysLeft fictif)
//   admin_reset       → reset compte admin test

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { sendAlert } from './alerts.js';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  // GET autorisé pour action=stats
  if (req.method === 'GET') {
    req.body = { secret: req.query.secret, action: 'stats', range: req.query.range };
  } else if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { secret, action, ...params } = req.body || {};

  // Auth — supporte aussi Authorization: Bearer pour les GET
  const authHeader = req.headers?.authorization || '';
  const effectiveSecret = secret || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '');
  if (!effectiveSecret || effectiveSecret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!action) return res.status(400).json({ error: 'action required' });

  try {
    initFirebase();
    const db = getFirestore();
    let result;

    // ── USERS ────────────────────────────────────────────────────────────────
    if (action === 'user_list') {
      const { limit = 50, onlyPremium, onlyBlocked } = params;
      let q = db.collection('users').limit(limit);
      if (onlyPremium) q = q.where('isPremium', '==', true);
      if (onlyBlocked) q = q.where('blocked', '==', true);
      const snap = await q.get();
      result = snap.docs.map(d => ({ id: d.id, ...pick(d.data(),
        ['isPremium','plan','expiresAt','blocked','piUsername','activatedAt','createdAt']
      )}));
    }

    else if (action === 'user_get') {
      const { piUserId } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      const doc = await db.collection('users').doc(piUserId).get();
      if (!doc.exists) return res.status(404).json({ error: 'User not found' });
      // Récupérer aussi ses paiements
      const txSnap = await db.collection('transactions')
        .where('piUserId', '==', piUserId).orderBy('createdAt', 'desc').limit(10).get();
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
      sendAlert('users_spike', { newUsers: 1, period: 'action manuelle', piUserId }).catch(() => {});
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
        ? Timestamp.fromMillis(Date.now() + days * 86400000)
        : null;
      await db.collection('users').doc(piUserId).set({
        isPremium:   !!enable,
        plan:        enable ? plan : null,
        expiresAt,
        manualOverride: true,
        overrideAt:  FieldValue.serverTimestamp(),
      }, { merge: true });
      result = { ok: true, piUserId, isPremium: !!enable, expiresAt: expiresAt?.toMillis() };
      if (enable) sendAlert('new_subscriber', { piUserId, plan }).catch(() => {});
      else        sendAlert('new_churn',      { piUserId, plan }).catch(() => {});
    }

    else if (action === 'user_reset_stats') {
      // Reset côté Firestore uniquement — localStorage est côté client
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
      let q = db.collection('transactions').orderBy('createdAt', 'desc').limit(limit);
      if (status)   q = db.collection('transactions').where('status', '==', status).limit(limit);
      if (piUserId) q = db.collection('transactions').where('piUserId', '==', piUserId).limit(limit);
      const snap = await q.get();
      result = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    else if (action === 'payment_repair') {
      const { paymentId } = params;
      if (!paymentId) return res.status(400).json({ error: 'paymentId required' });
      // Déléguer à pi-repair
      const r = await fetch(`${BASE_URL}/api/pi-repair`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ secret: ADMIN_SECRET }),
      });
      result = await r.json();
    }

    else if (action === 'payment_refund_log') {
      // Pi Network n'a pas d'API de remboursement — on log manuellement
      const { paymentId, piUserId, amount, reason } = params;
      if (!paymentId) return res.status(400).json({ error: 'paymentId required' });
      await db.collection('transactions').doc(paymentId).set(
        { status: 'refunded', refundedAt: FieldValue.serverTimestamp(), refundReason: reason || '', amount: amount || null },
        { merge: true }
      );
      // Désactiver le Premium si concerné
      if (piUserId) {
        await db.collection('users').doc(piUserId).set(
          { isPremium: false, plan: null },
          { merge: true }
        );
      }
      result = { ok: true, paymentId, refunded: true };
      sendAlert('payment_failed', { paymentId, piUserId, plan: 'refund' }).catch(() => {});
    }

    // ── MODE TEST ────────────────────────────────────────────────────────────
    else if (action === 'test_premium') {
      const { piUserId, days = 1 } = params;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      const expiresAt = Timestamp.fromMillis(Date.now() + days * 86400000);
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

    // ── STATS ─────────────────────────────────────────────────────────────────
    else if (action === 'stats') {
      const range = params.range || '30d';
      const now   = Date.now();
      const since = range === 'all' ? 0
        : range === '7d'  ? now - 7  * 86400000
        : now - 30 * 86400000;

    // ── Requêtes parallèles ──────────────────────────────────────────────────
    const [usersSnap, txSnap, logsSnap, statsDoc] = await Promise.all([
      db.collection('users').get(),
      db.collection('transactions').get(),
      db.collection('logs')
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get(),
      db.collection('stats').doc('global').get(),
    ]);

    // ── Users ────────────────────────────────────────────────────────────────
    const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalUsers   = users.length;
    const blockedUsers = users.filter(u => u.blocked).length;
    const newUsers     = users.filter(u => {
      const t = u.createdAt?.toMillis?.() || 0;
      return t > since;
    }).length;

    // Abonnés actifs RÉELS : isPremium + expiresAt dans le futur
    const activePremium  = users.filter(u =>
      u.isPremium && u.expiresAt && (u.expiresAt?.toMillis?.() || 0) > now
    );
    const activeMonthly  = activePremium.filter(u => u.plan === 'monthly').length;
    const activeAnnual   = activePremium.filter(u => u.plan === 'annual').length;
    const activePremiumCount = activePremium.length;

    // Churned : isPremium false OU expiresAt dépassé, mais ont déjà eu un abonnement
    const churnedUsers = users.filter(u =>
      !u.isPremium && u.plan && u.expiresAt &&
      (u.expiresAt?.toMillis?.() || 0) < now
    ).length;

    // Nouveaux premium dans la période
    const newPremiumInRange = users.filter(u => {
      const t = u.activatedAt?.toMillis?.() || 0;
      return u.isPremium && t > since;
    }).length;

    const conversionRate = totalUsers > 0
      ? ((activePremiumCount / totalUsers) * 100).toFixed(1) + '%'
      : '0%';

    // Churn rate = churned / (churned + actifs) sur la période
    const churnRate = (activePremiumCount + churnedUsers) > 0
      ? ((churnedUsers / (activePremiumCount + churnedUsers)) * 100).toFixed(1) + '%'
      : '0%';

    // Upgrades / Downgrades depuis planHistory
    let upgrades   = 0; // mensuel → annuel
    let downgrades = 0; // annuel → mensuel
    users.forEach(u => {
      const hist = u.planHistory || [];
      for (let i = 1; i < hist.length; i++) {
        const prev = hist[i-1].plan;
        const curr = hist[i].plan;
        const t    = hist[i].changedAt?.toMillis?.() || hist[i].changedAt || 0;
        if (t < since) continue;
        if (prev === 'monthly' && curr === 'annual') upgrades++;
        if (prev === 'annual'  && curr === 'monthly') downgrades++;
      }
    });

    // ── Transactions ─────────────────────────────────────────────────────────
    const txs = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Prix de référence (à aligner avec vos vrais tarifs)
    const PRICES = { monthly: 2.49, annual: 24.99, don: 0 };

    // Toutes transactions activées (historique complet pour revenus totaux)
    const allActivated = txs.filter(t =>
      ['activated', 'pi_completed'].includes(t.status)
    );

    // Transactions dans la période
    const txInRange = txs.filter(t => {
      const ts = t.createdAt?.toMillis?.() || 0;
      return ts > since;
    });
    const activatedInRange  = txInRange.filter(t => ['activated','pi_completed'].includes(t.status));
    const failedInRange     = txInRange.filter(t => t.status === 'paid_not_activated');
    const permFailInRange   = txInRange.filter(t => t.status === 'failed_permanently');
    const refundedInRange   = txInRange.filter(t => t.status === 'refunded');

    // Revenus séparés : abonnements vs dons
    function calcRevenue(list) {
      let subscriptions = 0, donations = 0;
      list.forEach(t => {
        const amount = t.amount || PRICES[t.plan] || 0;
        if (t.plan === 'don' || !t.plan) donations    += amount;
        else                             subscriptions += amount;
      });
      return { subscriptions, donations, total: subscriptions + donations };
    }

    const revenueAll    = calcRevenue(allActivated);
    const revenueRange  = calcRevenue(activatedInRange);

    // ARPU (Average Revenue Per User premium actif)
    const arpu = activePremiumCount > 0
      ? (revenueAll.subscriptions / activePremiumCount).toFixed(2)
      : '0.00';

    // Plan breakdown global
    const monthlyTxTotal = allActivated.filter(t => t.plan === 'monthly').length;
    const annualTxTotal  = allActivated.filter(t => t.plan === 'annual').length;
    const donsTxTotal    = allActivated.filter(t => t.plan === 'don' || !t.plan).length;

    // Paiements en attente de réparation (global, pas juste la période)
    const needsRepair = txs.filter(t => t.status === 'paid_not_activated').length;

    // ── Logs ─────────────────────────────────────────────────────────────────
    const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const errorLogs  = logs.filter(l => l.type === 'error');
    const adminLogs  = logs.filter(l => l.type === 'admin_action');
    // Filtrer les logs dans la période
    const logsInRange = logs.filter(l => {
      const t = l.timestamp?.toMillis?.() || 0;
      return t > since;
    });

    // ── Engagement ───────────────────────────────────────────────────────────
    const globalStats = statsDoc.exists ? statsDoc.data() : {};

    return res.status(200).json({
      ok: true,
      range,
      generatedAt: new Date().toISOString(),

      users: {
        total:          totalUsers,
        blocked:        blockedUsers,
        newInRange:     newUsers,
        conversionRate,
        churnRate,
        churnedTotal:   churnedUsers,
      },

      subscriptions: {
        activeTotal:    activePremiumCount,
        activeMonthly,
        activeAnnual,
        newInRange:     newPremiumInRange,
        upgrades,        // mensuel → annuel dans la période
        downgrades,      // annuel → mensuel dans la période
        churnRate,
        needsRepair,     // paiements bloqués (global)
      },

      revenue: {
        // Période sélectionnée
        periodSubscriptions: revenueRange.subscriptions.toFixed(2) + ' Pi',
        periodDonations:     revenueRange.donations.toFixed(2)     + ' Pi',
        periodTotal:         revenueRange.total.toFixed(2)         + ' Pi',
        // Tout temps
        allTimeSubscriptions: revenueAll.subscriptions.toFixed(2)  + ' Pi',
        allTimeDonations:     revenueAll.donations.toFixed(2)       + ' Pi',
        allTimeTotal:         revenueAll.total.toFixed(2)           + ' Pi',
        arpu:                 arpu + ' Pi',
        // Breakdown plans
        monthlyTxTotal,
        annualTxTotal,
        donsTxTotal,
      },

      payments: {
        totalInRange:     txInRange.length,
        activatedInRange: activatedInRange.length,
        failedActivation: failedInRange.length,
        permanentFail:    permFailInRange.length,
        refunded:         refundedInRange.length,
        successRate: txInRange.length > 0
          ? ((activatedInRange.length / txInRange.length) * 100).toFixed(1) + '%'
          : '—',
        needsRepair,
      },

      engagement: {
        totalViews:     globalStats.totalViews     || 0,
        totalClicks:    globalStats.totalClicks    || 0,
        topAnimes:      (globalStats.topAnimes     || []).slice(0, 5),
        platformClicks: globalStats.platformClicks || {},
      },

      logs: {
        errors:       errorLogs.length,
        adminActions: adminLogs.length,
        recent:       logsInRange.slice(0, 20).map(l => ({
          type:      l.type,
          action:    l.action || l.message || '—',
          params:    l.params || '',
          timestamp: l.timestamp?.toMillis?.() || null,
        })),
      },
        });
      return res.status(200).json({ ok: true, action: 'stats', result });
    }

    else {
      return res.status(400).json({ error: `Unknown action: ${action}` });
    }

    // Logger toutes les actions critiques
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
