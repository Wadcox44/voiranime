// api/admin-stats.js
// Stats agrégées pour le dashboard admin — v2
// GET /api/admin-stats?range=7d|30d|all
// Auth : header Authorization: Bearer <ADMIN_SECRET>

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';

const ADMIN_SECRET = process.env.ADMIN_SECRET;

function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

function getSecret(req) {
  const auth = req.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  // fallback legacy (à supprimer dans 1 mois)
  return req.query?.secret || req.body?.secret || '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = getSecret(req);
  if (!secret || secret !== ADMIN_SECRET)
    return res.status(401).json({ error: 'Unauthorized' });

  try {
    initFirebase();
    const db    = getFirestore();
    const range = req.query?.range || '30d';
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
    const PRICES = { monthly: 1.99, annual: 19.99, don: 0 };

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
        periodSubscriptions: revenueRange.subscriptions.toFixed(2) + ' π',
        periodDonations:     revenueRange.donations.toFixed(2)     + ' π',
        periodTotal:         revenueRange.total.toFixed(2)         + ' π',
        // Tout temps
        allTimeSubscriptions: revenueAll.subscriptions.toFixed(2)  + ' π',
        allTimeDonations:     revenueAll.donations.toFixed(2)       + ' π',
        allTimeTotal:         revenueAll.total.toFixed(2)           + ' π',
        arpu:                 arpu + ' π',
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

  } catch(e) {
    console.error('[admin-stats]', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
