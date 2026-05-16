// api/admin-stats.js
// Stats agrégées pour le dashboard admin
// GET ?secret=xxx&range=7d|30d|all

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query?.secret || req.body?.secret;
  if (!secret || secret !== ADMIN_SECRET) return res.status(401).json({ error: 'Unauthorized' });

  try {
    initFirebase();
    const db    = getFirestore();
    const range = req.query.range || '30d';
    const since = range === 'all' ? 0
      : range === '7d'  ? Date.now() - 7  * 86400000
      : Date.now() - 30 * 86400000;

    // Lancer toutes les queries en parallèle
    const [usersSnap, txSnap, logsSnap, statsDoc] = await Promise.all([
      db.collection('users').get(),
      db.collection('transactions').get(),
      db.collection('logs').where('timestamp', '>', new Date(since)).limit(200).get(),
      db.collection('stats').doc('global').get(),
    ]);

    // ── Users ────────────────────────────────────────────────────────────────
    const users     = usersSnap.docs.map(d => d.data());
    const totalUsers     = users.length;
    const premiumUsers   = users.filter(u => u.isPremium).length;
    const blockedUsers   = users.filter(u => u.blocked).length;
    const newUsers       = users.filter(u => {
      const t = u.createdAt?.toMillis?.() || 0;
      return t > since;
    }).length;
    const conversionRate = totalUsers > 0
      ? ((premiumUsers / totalUsers) * 100).toFixed(1) + '%'
      : '0%';

    // ── Paiements ────────────────────────────────────────────────────────────
    const txs = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const txInRange = txs.filter(t => {
      const ts = t.createdAt?.toMillis?.() || 0;
      return ts > since;
    });

    const paidTx           = txInRange.filter(t => ['activated','pi_completed'].includes(t.status));
    const failedTx         = txInRange.filter(t => t.status === 'paid_not_activated');
    const permanentFail    = txInRange.filter(t => t.status === 'failed_permanently');
    const refundedTx       = txInRange.filter(t => t.status === 'refunded');

    // Revenus estimés (Pi Network — valeur symbolique)
    const revenue = paidTx.reduce((sum, t) => {
      return sum + (t.plan === 'annual' ? 19.99 : t.plan === 'monthly' ? 1.99 : 0);
    }, 0);
    const arpu = premiumUsers > 0 ? (revenue / premiumUsers).toFixed(2) : '0';

    // Plan breakdown
    const monthlyCount = txs.filter(t => t.status === 'activated' && t.plan === 'monthly').length;
    const annualCount  = txs.filter(t => t.status === 'activated' && t.plan === 'annual').length;

    // ── Logs ────────────────────────────────────────────────────────────────
    const logs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const errorLogs  = logs.filter(l => l.type === 'error');
    const adminLogs  = logs.filter(l => l.type === 'admin_action');

    // ── Stats Firestore globales (vues, clics) ────────────────────────────────
    const globalStats = statsDoc.exists ? statsDoc.data() : {};

    return res.status(200).json({
      ok: true,
      range,
      generatedAt: new Date().toISOString(),

      users: {
        total:          totalUsers,
        premium:        premiumUsers,
        blocked:        blockedUsers,
        newInRange:     newUsers,
        conversionRate,
      },

      business: {
        revenue:        revenue.toFixed(2) + ' Pi',
        arpu:           arpu + ' Pi',
        monthly:        monthlyCount,
        annual:         annualCount,
      },

      payments: {
        total:          txInRange.length,
        activated:      paidTx.length,
        failedActivation: failedTx.length,
        permanentFail:  permanentFail.length,
        refunded:       refundedTx.length,
        successRate:    txInRange.length > 0
          ? ((paidTx.length / txInRange.length) * 100).toFixed(1) + '%'
          : '—',
      },

      engagement: {
        totalViews:     globalStats.totalViews     || 0,
        totalClicks:    globalStats.totalClicks    || 0,
        topAnimes:      globalStats.topAnimes      || [],
        platformClicks: globalStats.platformClicks || {},
      },

      logs: {
        errors:       errorLogs.length,
        adminActions: adminLogs.length,
        recent:       logs.slice(0, 10),
      },
    });

  } catch(e) {
    console.error('[admin-stats]', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
