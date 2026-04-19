// api/premium.js
// Gestion centralisée des abonnements Premium VoirAnime
// POST { action: 'activate'|'status'|'cancel', piUserId, ...params }
//
// activate : { piUserId, plan, paymentId, txid }  → appelé par pi-complete après confirmation Pi
// status   : { piUserId }                          → retourne statut Premium complet
// cancel   : { piUserId }                          → désactive à expiration (pas de remboursement)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp }       from 'firebase-admin/firestore';
import { getUser }                         from './_userHelper.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

/* ── Plans disponibles ─────────────────────────────────────────────────────
   Pour ajouter un plan : ajouter une entrée ici — le reste s'adapte auto
──────────────────────────────────────────────────────────────────────────── */
const PLANS = {
  monthly: {
    label:       'Monthly',
    amount:      1.99,
    durationMs:  30 * 24 * 3600 * 1000,   // 30 jours
    durationDays: 30,
  },
  annual: {
    label:       'Annual',
    amount:      19.99,
    durationMs:  365 * 24 * 3600 * 1000,  // 365 jours
    durationDays: 365,
  },
};

/* ── Helper : lire + calculer statut ── */

/* ── Actions ── */

// Activer ou renouveler un abonnement après paiement Pi confirmé
// Appelé par api/pi-complete.js
async function actionActivate(piUserId, { plan, paymentId, txid, piUsername }) {
  if (!piUserId || !plan || !paymentId) {
    return [400, { error: 'piUserId, plan and paymentId required' }];
  }

  const planDef = PLANS[plan];
  if (!planDef) {
    return [400, { error: `Unknown plan: ${plan}. Valid: ${Object.keys(PLANS).join('|')}` }];
  }

  // Vérifier que ce paymentId n'a pas déjà été utilisé (anti-replay)
  const subRef = db.collection('subscriptions').doc(paymentId);
  const subDoc = await subRef.get();
  if (subDoc.exists && subDoc.data().status === 'active') {
    return [200, { ok: true, alreadyActivated: true }];
  }

  const now      = Date.now();
  const { ref, data } = await getUser(piUserId);

  // Si déjà Premium actif → prolonger depuis expiresAt (pas depuis maintenant)
  const currentExpiry = (data.isPremium && data.expiresAt?.toMillis() > now)
    ? data.expiresAt.toMillis()
    : now;
  const newExpiry = currentExpiry + planDef.durationMs;
  const expiresAt = Timestamp.fromMillis(newExpiry);

  // Écriture atomique : user + subscription
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

  return [200, {
    ok:         true,
    isPremium:  true,
    plan,
    expiresAt:  newExpiry,
    daysLeft:   planDef.durationDays,
    message:    `Premium ${planDef.label} activated — valid for ${planDef.durationDays} days`,
  }];
}

// Retourner le statut Premium complet
async function actionStatus(piUserId) {
  if (!piUserId) return [400, { error: 'piUserId required' }];

  const { isPremium, subscriptionStatus, expiresAt, daysLeft, willRenew, data } = await getUser(piUserId);

  return [200, {
    ok: true,
    isPremium,
    subscriptionStatus, // 'active' | 'expired' | 'none'
    plan:      data.plan || null,
    expiresAt,
    daysLeft,
    willRenew,
    piUsername: data.piUsername || '',
    features: {
      favoritesLimit:     isPremium ? null  : 20,
      statsEnabled:       isPremium,
      reorderEnabled:     isPremium,
      earlyAccess:        isPremium,
      profileBadge:       isPremium,
      notificationTypes:  isPremium ? ['new_episode','recommendation','trending','similar'] : ['new_episode'],
    },
  }];
}

// Marquer pour annulation à expiration (pas de remboursement, accès jusqu'à expiresAt)
async function actionCancel(piUserId) {
  if (!piUserId) return [400, { error: 'piUserId required' }];

  const { ref, isPremium } = await getUser(piUserId);
  if (!isPremium) return [400, { error: 'No active subscription to cancel' }];

  await ref.update({ willCancel: true });

  return [200, {
    ok:      true,
    message: 'Subscription will not renew. Access remains until expiration.',
  }];
}

/* ── Handler ── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET rapide pour status (utilisé par le client au chargement)
  if (req.method === 'GET') {
    const { piUserId } = req.query;
    const [status, body] = await actionStatus(piUserId).catch(e => {
      console.error('[premium GET]', e);
      return [500, { error: 'Server error' }];
    });
    return res.status(status).json(body);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, piUserId, ...params } = req.body || {};
  if (!action) return res.status(400).json({ error: 'action required: activate|status|cancel' });

  try {
    let status, body;
    if      (action === 'activate') [status, body] = await actionActivate(piUserId, params);
    else if (action === 'status')   [status, body] = await actionStatus(piUserId);
    else if (action === 'cancel')   [status, body] = await actionCancel(piUserId);
    else return res.status(400).json({ error: `Unknown action: ${action}` });

    return res.status(status).json(body);
  } catch (e) {
    console.error('[premium]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
