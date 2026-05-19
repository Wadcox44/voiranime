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
import { checkRateLimit } from './_rateLimit.js';

// ════════════════════════════════════════════════════════
// ALERTS — fusionné depuis alerts.js
// ════════════════════════════════════════════════════════

const RESEND_API_KEY  = process.env.RESEND_API_KEY;
const ADMIN_EMAIL     = 'voiranime.admin@gmail.com';
const FROM_EMAIL      = 'onboarding@resend.dev';
const SITE_NAME       = 'VoirAnime';

function buildEmail(type, data) {
  const now = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  const templates = {

    payment_failed: {
      subject: `⚠️ [${SITE_NAME}] Paiement non activé — ${data.paymentId || ''}`,
      html: `
        <h2 style="color:#ef4444">⚠️ Paiement non activé</h2>
        <p>Un paiement Pi n'a pas pu être activé après plusieurs tentatives.</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">Payment ID</td><td style="padding:8px;font-family:monospace">${data.paymentId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Tentatives</td><td style="padding:8px">${data.attempts || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR" 
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Réparer dans l'admin
          </a>
        </p>
      `,
    },

    payment_success: {
      subject: `✅ [${SITE_NAME}] Nouveau paiement activé — ${data.plan || ''}`,
      html: `
        <h2 style="color:#22c55e">✅ Nouveau paiement activé</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Montant</td><td style="padding:8px">${data.amount || '—'} Pi</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    new_churn: {
      subject: `📉 [${SITE_NAME}] Abonnement expiré — ${data.piUserId || ''}`,
      html: `
        <h2 style="color:#f59e0b">📉 Abonnement expiré sans renouvellement</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Expiré le</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    new_subscriber: {
      subject: `⭐ [${SITE_NAME}] Nouvel abonné Premium — ${data.plan || ''}`,
      html: `
        <h2 style="color:#a78bfa">⭐ Nouvel abonné Premium</h2>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:8px;color:#64748b">User</td><td style="padding:8px">${data.piUsername || data.piUserId || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Plan</td><td style="padding:8px">${data.plan || '—'}</td></tr>
          <tr><td style="padding:8px;color:#64748b">Date</td><td style="padding:8px">${now}</td></tr>
        </table>
      `,
    },

    users_spike: {
      subject: `🚨 [${SITE_NAME}] Pic d'inscriptions détecté`,
      html: `
        <h2 style="color:#ef4444">🚨 Pic d'inscriptions inhabituel</h2>
        <p>${data.newUsers || '?'} nouveaux inscrits en ${data.period || '1h'} — activité suspecte possible.</p>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR"
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Vérifier dans l'admin
          </a>
        </p>
      `,
    },

    repair_needed: {
      subject: `🔧 [${SITE_NAME}] ${data.count || '?'} paiement(s) à réparer`,
      html: `
        <h2 style="color:#f59e0b">🔧 Paiements en attente de réparation</h2>
        <p>${data.count || '?'} paiement(s) sont dans l'état <strong>paid_not_activated</strong>.</p>
        <p style="margin-top:16px">
          <a href="https://voir-anime.vercel.app/va-ctrl-9x#va-9xKm2pR"
             style="background:#7c4dff;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600">
            Réparer dans l'admin
          </a>
        </p>
      `,
    },

  };

  return templates[type] || null;
}

// ── Envoi via Resend ──────────────────────────────────────────────────────────
export async function sendAlert(type, data = {}) {
  if (!RESEND_API_KEY) {
    console.warn('[alerts] RESEND_API_KEY manquant — email non envoyé');
    return false;
  }

  const tpl = buildEmail(type, data);
  if (!tpl) {
    console.warn('[alerts] Template inconnu:', type);
    return false;
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${SITE_NAME} <${FROM_EMAIL}>`,
        to:      [ADMIN_EMAIL],
        subject: tpl.subject,
        html:    `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
            ${tpl.html}
            <hr style="margin-top:32px;border:none;border-top:1px solid #e2e8f0"/>
            <p style="font-size:12px;color:#94a3b8;margin-top:12px">
              ${SITE_NAME} Admin Alerts · Envoyé automatiquement
            </p>
          </div>
        `,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('[alerts] Resend error:', err);
      return false;
    }

    console.log('[alerts] Email envoyé:', type);
    return true;

  } catch(e) {
    console.error('[alerts] Fetch error:', e.message);
    return false;
  }
}

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


// ── buildStats — calcule toutes les stats pour la page admin ─────────────
async function buildStats(db, range = '7d') {
  const now = Date.now();
  const rangeMs = { '24h': 86400000, '7d': 604800000, '30d': 2592000000, '90d': 7776000000, 'all': null };
  const ms    = rangeMs[range] ?? rangeMs['7d'];
  const since = new Date(ms ? now - ms : 0);

  // ── Users ──────────────────────────────────────────────────────────────
  const usersSnap = await db.collection('users').get();
  const allUsers  = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const total     = allUsers.length;

  // Nouveaux dans la période
  const newInRange = allUsers.filter(u => {
    const t = u.firstSeenAt?.toMillis?.() || u.createdAt?.toMillis?.() || 0;
    return t >= since.getTime();
  }).length;

  // Premium actifs
  const premium = allUsers.filter(u => u.isPremium === true);

  // Churners : ont déjà eu un abonnement mais ne sont plus premium
  const churned = allUsers.filter(u => !u.isPremium && u.expiresAt);

  // Utilisateurs ayant annulé (willCancel = true mais encore actifs)
  const willCancelCount = allUsers.filter(u => u.isPremium && u.willCancel === true).length;

  // CORRECTION taux de conversion : exclure les users inscrits depuis moins de 24h
  const eligibleForConversion = allUsers.filter(u => {
    const t = u.firstSeenAt?.toMillis?.() || u.createdAt?.toMillis?.() || 0;
    return t > 0 && (now - t) >= 86400000; // au moins 24h d'ancienneté
  });
  const conversionRate = eligibleForConversion.length > 0
    ? Math.round(premium.length / eligibleForConversion.length * 100) + '%'
    : '0%';

  // CORRECTION taux de churn : inclut willCancel
  const effectiveChurned = churned.length + willCancelCount;
  const churnBase = premium.length + churned.length;
  const churnRate = churnBase > 0
    ? Math.round(effectiveChurned / churnBase * 100) + '%'
    : '0%';

  // Funnel : inscription → première interaction → premium
  const hadAnyActivity = allUsers.filter(u => u.lastSeenAt && u.firstSeenAt &&
    u.lastSeenAt?.toMillis?.() > u.firstSeenAt?.toMillis?.()
  ).length;
  const funnelAuth       = total;
  const funnelActive     = hadAnyActivity;
  const funnelPremium    = premium.length;
  const funnelAuthToActive   = total > 0 ? Math.round(hadAnyActivity / total * 100) + '%' : '0%';
  const funnelActiveToPremium = hadAnyActivity > 0 ? Math.round(premium.length / hadAnyActivity * 100) + '%' : '0%';

  // DAU/MAU (approximation via lastSeenAt)
  const dau24h = allUsers.filter(u => {
    const t = u.lastSeenAt?.toMillis?.() || 0;
    return t >= now - 86400000;
  }).length;
  const mau30d = allUsers.filter(u => {
    const t = u.lastSeenAt?.toMillis?.() || 0;
    return t >= now - 2592000000;
  }).length;
  const dauMauRatio = mau30d > 0 ? Math.round(dau24h / mau30d * 100) + '%' : '0%';

  // Top raisons d'annulation
  const cancelReasons = {};
  allUsers.forEach(u => {
    if (u.cancelReason) {
      cancelReasons[u.cancelReason] = (cancelReasons[u.cancelReason] || 0) + 1;
    }
  });
  const topCancelReasons = Object.entries(cancelReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }));

  // Temps médian free → premium (en jours)
  const conversionTimes = premium
    .filter(u => u.firstSeenAt && u.activatedAt)
    .map(u => (u.activatedAt?.toMillis?.() - u.firstSeenAt?.toMillis?.()) / 86400000)
    .filter(d => d >= 0 && d < 365);
  const medianConversionDays = conversionTimes.length > 0
    ? Math.round(conversionTimes.sort((a,b) => a-b)[Math.floor(conversionTimes.length / 2)])
    : null;

  // ── Subscriptions ──────────────────────────────────────────────────────
  const subsSnap   = await db.collection('subscriptions').get();
  const allSubs    = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const activeSubs = allSubs.filter(s => s.status === 'active');
  const newSubs    = allSubs.filter(s => {
    const t = s.activatedAt?.toMillis?.() || 0;
    return t >= since.getTime();
  });

  const activeMonthly = activeSubs.filter(s => s.plan === 'monthly').length;
  const activeAnnual  = activeSubs.filter(s => s.plan === 'annual').length;

  // Upgrades/downgrades
  const subsByUser = {};
  allSubs.forEach(s => {
    if (!subsByUser[s.piUserId]) subsByUser[s.piUserId] = [];
    subsByUser[s.piUserId].push(s);
  });
  let upgrades = 0, downgrades = 0;
  Object.values(subsByUser).forEach(subs => {
    if (subs.length < 2) return;
    subs.sort((a, b) => (a.activatedAt?.toMillis?.() || 0) - (b.activatedAt?.toMillis?.() || 0));
    for (let i = 1; i < subs.length; i++) {
      if (subs[i-1].plan === 'monthly' && subs[i].plan === 'annual') upgrades++;
      if (subs[i-1].plan === 'annual'  && subs[i].plan === 'monthly') downgrades++;
    }
  });

  // ── Paiements / Transactions ───────────────────────────────────────────
  const txSnap    = await db.collection('transactions').get();
  const allTx     = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const activated = allTx.filter(t => t.status === 'activated');
  const needsRepair = allTx.filter(t => t.status === 'paid_not_activated').length;
  const activatedInRange = activated.filter(t => {
    const ts = t.activatedAt?.toMillis?.() || t.completedAt?.toMillis?.() || 0;
    return ts >= since.getTime();
  }).length;
  const successRate = allTx.length > 0
    ? Math.round(activated.length / allTx.length * 100) + '%' : '0%';

  // ── Revenus ────────────────────────────────────────────────────────────
  const subTx   = activated.filter(t => t.plan === 'monthly' || t.plan === 'annual');
  const donTx   = activated.filter(t => !t.plan || t.plan === 'donation');
  const periodSubTx = subTx.filter(t => {
    const ts = t.activatedAt?.toMillis?.() || t.completedAt?.toMillis?.() || 0;
    return ts >= since.getTime();
  });
  const periodDonTx = donTx.filter(t => {
    const ts = t.activatedAt?.toMillis?.() || t.completedAt?.toMillis?.() || 0;
    return ts >= since.getTime();
  });

  const sumPi = arr => arr.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
  const allTimeSubscriptions = sumPi(subTx);
  const allTimeDonations     = sumPi(donTx);
  const periodSubscriptions  = sumPi(periodSubTx);
  const periodDonations      = sumPi(periodDonTx);
  const periodTotal          = periodSubscriptions + periodDonations;

  // CORRECTION ARPU : sur abonnés uniques ayant payé, pas juste les actifs
  const uniquePayingUsers = new Set(subTx.map(t => t.piUserId).filter(Boolean)).size;
  const arpu = uniquePayingUsers > 0
    ? Math.round(allTimeSubscriptions / uniquePayingUsers * 100) / 100 : 0;

  // MRR estimé (Monthly Recurring Revenue)
  const mrrMonthly = activeMonthly * 2.49;
  const mrrAnnual  = activeAnnual  * (24.99 / 12);
  const mrr        = Math.round((mrrMonthly + mrrAnnual) * 100) / 100;

  // ── Top animes (vues) ──────────────────────────────────────────────────
  let topAnimes = [];
  try {
    const viewsSnap = await db.collection('stats').doc('views').collection('anime')
      .orderBy('total', 'desc').limit(10).get();
    topAnimes = viewsSnap.docs.map(d => ({ animeId: d.id, views: d.data().total || 0 }));
  } catch(e) {}

  // ── Top favoris ────────────────────────────────────────────────────────
  const favCounts = {};
  allUsers.forEach(u => {
    (u.favorites || []).forEach(f => {
      if (f.id) favCounts[f.id] = { count: (favCounts[f.id]?.count || 0) + 1, title: f.title || f.id };
    });
  });
  const topFavorites = Object.entries(favCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 10)
    .map(([id, v]) => ({ animeId: id, title: v.title, count: v.count }));

  // ── Logs récents ───────────────────────────────────────────────────────
  let recentLogs = [];
  try {
    const logsSnap = await db.collection('logs')
      .orderBy('timestamp', 'desc').limit(20).get();
    recentLogs = logsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch(e) {}

  return {
    users: {
      total,
      newInRange,
      premiumTotal:       premium.length,
      churnedTotal:       churned.length,
      willCancelCount,
      conversionRate,
      churnRate,
      eligibleCount:      eligibleForConversion.length,
      medianConversionDays,
    },
    funnel: {
      auth:              funnelAuth,
      active:            funnelActive,
      premium:           funnelPremium,
      authToActiveRate:  funnelAuthToActive,
      activeToPremiumRate: funnelActiveToPremium,
    },
    retention: {
      dau: dau24h,
      mau: mau30d,
      dauMauRatio,
    },
    behavior: {
      topAnimes,
      topFavorites,
      topCancelReasons,
    },
    subscriptions: {
      activeTotal:   activeSubs.length,
      activeMonthly,
      activeAnnual,
      newInRange:    newSubs.length,
      upgrades,
      downgrades,
    },
    payments: {
      activatedInRange,
      needsRepair,
      successRate,
    },
    revenue: {
      periodTotal,
      periodSubscriptions,
      periodDonations,
      allTimeTotal:          allTimeSubscriptions + allTimeDonations,
      allTimeSubscriptions,
      allTimeDonations,
      monthlyTxTotal:        subTx.filter(t => t.plan === 'monthly').length,
      annualTxTotal:         subTx.filter(t => t.plan === 'annual').length,
      donsTxTotal:           donTx.length,
      arpu,
      mrr,
    },
    logs: { recent: recentLogs },
  };
}


// ── Anti-spam : store en mémoire (reset à chaque cold start) ─────────────
// Pour un anti-spam persistant, utiliser Firestore. Ici on utilise _rateLimit.js
// qui gère déjà la limite par IP.
const CONTACT_SUBJECTS = [
  'bug_technique','probleme_video','anime_manquant','suggestion',
  'probleme_abonnement','compte_pi','partenariat','business','autre'
];
const SUBJECT_LABELS = {
  bug_technique:        '🐛 Bug technique',
  probleme_video:       '📺 Problème lecture vidéo',
  anime_manquant:       '🎌 Anime manquant',
  suggestion:           '💡 Suggestion d'amélioration',
  probleme_abonnement:  '💳 Problème abonnement / paiement',
  compte_pi:            '⚡ Compte Pi / connexion',
  partenariat:          '🤝 Partenariat',
  business:             '📊 Business',
  autre:                '✏️ Autre',
};
const PRIORITY_LABELS = { low: '🟢 Faible', medium: '🟡 Normale', high: '🔴 Urgente' };

async function actionContact(req, res) {
  // ── Rate limit : 3 messages / heure par IP ─────────────────────────────
  const limited = await checkRateLimit(req, 'contact', 3, 3600);
  if (limited) {
    return res.status(429).json({ error: 'Trop de messages envoyés. Réessaie dans 1h.' });
  }

  const {
    subject, message, priority = 'low',
    piUserId, piUsername,
    firstname, lastname, email,
    anime,
  } = req.body || {};

  // ── Validation ─────────────────────────────────────────────────────────
  const isPiUser = !!piUserId;
  if (!isPiUser && (!firstname?.trim() || !lastname?.trim() || !email?.trim())) {
    return res.status(400).json({ error: 'Prénom, nom et email requis.' });
  }
  if (!CONTACT_SUBJECTS.includes(subject)) {
    return res.status(400).json({ error: 'Sujet invalide.' });
  }
  const msgClean = message?.trim();
  if (!msgClean || msgClean.length < 10) {
    return res.status(400).json({ error: 'Message trop court (min 10 caractères).' });
  }
  if (msgClean.length > 3000) {
    return res.status(400).json({ error: 'Message trop long (max 3000 caractères).' });
  }

  // ── Anti-spam basique : détecter les URLs multiples ────────────────────
  const urlCount = (msgClean.match(/https?:\/\//g) || []).length;
  if (urlCount > 2) {
    return res.status(400).json({ error: 'Message rejeté (spam détecté).' });
  }

  // ── Construire l'email ─────────────────────────────────────────────────
  const now       = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const fromLabel = isPiUser
    ? `@${piUsername || piUserId}`
    : `${firstname} ${lastname} &lt;${email}&gt;`;
  const subjectLabel  = SUBJECT_LABELS[subject] || subject;
  const priorityLabel = PRIORITY_LABELS[priority] || priority;
  const priorityColor = priority === 'high' ? '#ef4444' : priority === 'medium' ? '#f59e0b' : '#22c55e';

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:12px">
      <h2 style="margin:0 0 4px;color:#0f172a">✉️ Nouveau message — VoirAnime</h2>
      <p style="margin:0 0 20px;color:#64748b;font-size:13px">${now}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
        <tr style="background:#fff;border-radius:8px">
          <td style="padding:10px 14px;color:#64748b;width:140px">Expéditeur</td>
          <td style="padding:10px 14px;font-weight:700;color:#0f172a">${fromLabel}</td>
        </tr>
        ${isPiUser ? `<tr><td style="padding:10px 14px;color:#64748b">Pi UID</td><td style="padding:10px 14px;font-family:monospace;font-size:12px;color:#7c4dff">${piUserId}</td></tr>` : `<tr><td style="padding:10px 14px;color:#64748b">Email</td><td style="padding:10px 14px"><a href="mailto:${email}" style="color:#7c4dff">${email}</a></td></tr>`}
        <tr>
          <td style="padding:10px 14px;color:#64748b">Sujet</td>
          <td style="padding:10px 14px;font-weight:600">${subjectLabel}</td>
        </tr>
        ${anime ? `<tr><td style="padding:10px 14px;color:#64748b">Anime</td><td style="padding:10px 14px">${anime}</td></tr>` : ''}
        <tr>
          <td style="padding:10px 14px;color:#64748b">Urgence</td>
          <td style="padding:10px 14px;font-weight:700;color:${priorityColor}">${priorityLabel}</td>
        </tr>
      </table>

      <div style="background:#fff;border-radius:8px;padding:16px;font-size:14px;line-height:1.7;color:#1e293b;white-space:pre-wrap">${msgClean.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>

      <hr style="margin:24px 0;border:none;border-top:1px solid #e2e8f0"/>
      <p style="font-size:12px;color:#94a3b8;margin:0">
        VoirAnime · Message reçu via le formulaire de contact
        ${isPiUser ? '· Utilisateur Pi authentifié ✅' : ''}
      </p>
    </div>
  `;

  // ── Envoyer via Resend ─────────────────────────────────────────────────
  if (!RESEND_API_KEY) {
    console.warn('[contact] RESEND_API_KEY manquant');
    return res.status(500).json({ error: 'Service email non configuré.' });
  }

  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'VoirAnime Contact <onboarding@resend.dev>',
      to:      [ADMIN_EMAIL],
      reply_to: isPiUser ? undefined : email,
      subject: `[${priorityLabel}] ${subjectLabel} — ${isPiUser ? '@'+piUsername : firstname+' '+lastname}`,
      html,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('[contact] Resend error:', err);
    return res.status(500).json({ error: 'Erreur envoi email.' });
  }

  // ── Log dans Firestore (optionnel, pour historique) ────────────────────
  try {
    initFirebase();
    const db = getFirestore();
    await db.collection('contacts').add({
      subject, priority, piUserId: piUserId || null,
      piUsername: piUsername || null,
      name: isPiUser ? null : `${firstname} ${lastname}`,
      email: isPiUser ? null : email,
      anime: anime || null,
      messageLength: msgClean.length,
      sentAt: FieldValue.serverTimestamp(),
    });
  } catch(e) { /* non bloquant */ }

  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── Handler GET — appelé par la page admin pour login + stats ──────────
  if (req.method === 'GET') {
    const { secret, action, range = '7d' } = req.query || {};
    if (!secret || secret !== ADMIN_SECRET)
      return res.status(401).json({ error: 'Unauthorized' });

    try {
      initFirebase();
      const db = getFirestore();

      if (action === 'stats') {
        const result = await buildStats(db, range);
        return res.status(200).json({ ok: true, ...result });
      }

      return res.status(400).json({ error: `Unknown GET action: ${action}` });
    } catch(e) {
      console.error('[admin GET]', e);
      return res.status(500).json({ error: 'Server error', message: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { secret, action, ...params } = req.body || {};

  // ── Action contact — publique, pas de secret requis ───────────────────
  if (action === 'contact') {
    return actionContact(req, res);
  }

  // Auth — toutes les autres actions nécessitent le secret
  if (!secret || secret !== ADMIN_SECRET) {
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

    // ── STATS RAPIDES (lit stats/global pré-agrégé) ────────────────────────────
    else if (action === 'stats_quick') {
      const statsDoc = await db.collection('stats').doc('global').get();
      result = statsDoc.exists ? statsDoc.data() : { error: 'No stats yet — run cron-stats first' };
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
