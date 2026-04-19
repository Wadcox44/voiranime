// api/favorites.js
// Gestion complète des favoris Free/Premium en un seul endpoint
// POST { action: 'add'|'remove'|'sync', piUserId, ...params }
//
// add    : { piUserId, animeId, title, img }
// remove : { piUserId, animeId }
// sync   : { piUserId, favorites: [{id, title, img}] }

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db         = getFirestore();
const FREE_LIMIT = 20;

/* ── Helpers ── */
function initAdmin() {}

async function getUser(piUserId) {
  const doc  = await db.collection('users').doc(piUserId).get();
  const data = doc.exists ? doc.data() : {};
  const isPremium = data.isPremium === true
    && data.expiresAt
    && data.expiresAt.toMillis() > Date.now();
  return { ref: db.collection('users').doc(piUserId), data, isPremium };
}

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

/* ── Handler ── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { action, piUserId, ...params } = req.body || {};
  if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
  if (!action)   return res.status(400).json({ error: 'action required: add|remove|sync' });

  try {
    let status, body;
    if      (action === 'add')    [status, body] = await actionAdd(piUserId, params);
    else if (action === 'remove') [status, body] = await actionRemove(piUserId, params);
    else if (action === 'sync')   [status, body] = await actionSync(piUserId, params);
    else return res.status(400).json({ error: `Unknown action: ${action}` });

    return res.status(status).json(body);
  } catch (e) {
    console.error('[favorites]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
