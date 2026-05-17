// api/premium.js  (+ favorites fusionné)
// Gestion centralisée des abonnements Premium VoirAnime
// POST { action: 'activate'|'status'|'cancel'|'add'|'remove'|'sync'|'reorder', piUserId, ...params }
//
// activate : { piUserId, plan, paymentId, txid }  → proxy vers la logique dans pi-complete
//             Préférer appeler pi-complete directement — cette action reste pour compatibilité
// status   : { piUserId }                          → retourne statut Premium complet
// cancel   : { piUserId }                          → désactive à expiration (pas de remboursement)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getUser, requirePremium }          from './_userHelper.js';

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
const FREE_LIMIT = 20;

/* ── Plans disponibles ─────────────────────────────────────────────────────
   Pour ajouter un plan : ajouter une entrée ici — le reste s'adapte auto
   Prix alignés sur l'UI client (profile.html PREM_PLANS) — Offre de lancement
──────────────────────────────────────────────────────────────────────────── */
const PLANS = {
  monthly: {
    label:       'Monthly',
    amount:      2.49,
    durationMs:  30 * 24 * 3600 * 1000,   // 30 jours
    durationDays: 30,
  },
  annual: {
    label:       'Annual',
    amount:      24.99,
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
  const guard = await requirePremium(piUserId, 'subscription_cancel');
  if (guard) return [guard.status, { ...guard.body, error: 'No active subscription to cancel' }];

  const { ref } = await getUser(piUserId);

  await ref.update({ willCancel: true });

  return [200, {
    ok:      true,
    message: 'Subscription will not renew. Access remains until expiration.',
  }];
}

/* ── Favoris (fusionné depuis favorites.js) ─────────────────────────────── */
/* ── Actions ── */
async function actionAdd(piUserId, { animeId, title, img }) {
  if (!animeId) return [400, { error: 'animeId required' }];
  const numId = Number(animeId);
  if (isNaN(numId)) return [400, { error: 'Invalid animeId' }];

  const { ref, isPremium } = await getUser(piUserId);
  const favsRef   = ref.collection('favorites');
  const favDocRef = favsRef.doc(String(numId));

  // Déjà en favori
  if ((await favDocRef.get()).exists) {
    const snap = await favsRef.count().get();
    return [200, { ok: true, alreadyExists: true, count: snap.data().count, isPremium }];
  }

  // Vérifier limite Free
  if (!isPremium) {
    const snap = await favsRef.count().get();
    if (snap.data().count >= FREE_LIMIT) {
      return [403, { error: 'LIMIT_REACHED', limit: FREE_LIMIT, count: snap.data().count, isPremium: false }];
    }
  }

  // Ajouter
  await favDocRef.set({ animeId: numId, title: title || '', img: img || '', addedAt: Timestamp.now() });
  await ref.set(
    { favorites: FieldValue.arrayUnion({ id: numId, title: title || '', img: img || '' }) },
    { merge: true }
  );

  const newSnap = await favsRef.count().get();
  return [200, {
    ok: true,
    count: newSnap.data().count,
    isPremium,
    limit:     isPremium ? null : FREE_LIMIT,
    remaining: isPremium ? null : FREE_LIMIT - newSnap.data().count,
  }];
}

async function actionRemove(piUserId, { animeId }) {
  if (!animeId) return [400, { error: 'animeId required' }];
  const numId = Number(animeId);
  if (isNaN(numId)) return [400, { error: 'Invalid animeId' }];

  const { ref } = await getUser(piUserId);
  await ref.collection('favorites').doc(String(numId)).delete();

  const userData = (await ref.get()).data() || {};
  const favs     = (userData.favorites || []).filter(f => Number(f.id) !== numId);
  await ref.set({ favorites: favs }, { merge: true });

  const snap = await ref.collection('favorites').count().get();
  return [200, { ok: true, count: snap.data().count }];
}

async function actionSync(piUserId, { favorites }) {
  if (!Array.isArray(favorites)) return [400, { error: 'favorites array required' }];

  const { ref, isPremium } = await getUser(piUserId);
  const toSync = isPremium ? favorites : favorites.slice(0, FREE_LIMIT);

  const batch   = db.batch();
  const favsRef = ref.collection('favorites');
  for (const fav of toSync) {
    const numId = Number(fav.id);
    if (isNaN(numId)) continue;
    batch.set(favsRef.doc(String(numId)), {
      animeId: numId, title: fav.title || '', img: fav.img || '', addedAt: Timestamp.now(),
    }, { merge: true });
  }
  batch.set(ref, {
    favorites: toSync.map(f => ({ id: Number(f.id), title: f.title || '', img: f.img || '' })),
  }, { merge: true });
  await batch.commit();

  return [200, { ok: true, synced: toSync.length, truncated: favorites.length > toSync.length, isPremium }];
}

// Reorder — Premium uniquement : sauvegarde le nouvel ordre dans Firestore
// POST { piUserId, order: [animeId1, animeId2, ...] }
async function actionReorder(piUserId, { order }) {
  if (!Array.isArray(order)) return [400, { error: 'order array required' }];

  const { ref, isPremium } = await getUser(piUserId);

  // Middleware Premium — non contournable
  const guard = await requirePremium(piUserId, 'favorites_reorder');
  if (guard) return [guard.status, guard.body];

  // Récupérer les données actuelles des favoris depuis Firestore
  const favsSnap = await ref.collection('favorites').get();
  const favsMap  = {};
  favsSnap.docs.forEach(doc => {
    favsMap[String(doc.data().animeId)] = doc.data();
  });

  // Reconstruire le tableau ordonné
  const ordered = order
    .map(id => favsMap[String(Number(id))])
    .filter(Boolean);

  // Sauvegarder le nouvel ordre sur le doc user (le tableau favorites[] définit l'ordre)
  await ref.set({
    favorites:      ordered.map(f => ({ id: f.animeId, title: f.title, img: f.img })),
    favoritesOrder: order.map(Number), // tableau des IDs dans l'ordre
  }, { merge: true });

  return [200, { ok: true, count: ordered.length }];
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
    // Favoris
    else if (action === 'add')      [status, body] = await actionAdd(piUserId, params);
    else if (action === 'remove')   [status, body] = await actionRemove(piUserId, params);
    else if (action === 'sync')     [status, body] = await actionSync(piUserId, params);
    else if (action === 'reorder')  [status, body] = await actionReorder(piUserId, params);
    else return res.status(400).json({ error: `Unknown action: ${action}. Valid: activate|status|cancel|add|remove|sync|reorder` });

    return res.status(status).json(body);
  } catch (e) {
    console.error('[premium]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
