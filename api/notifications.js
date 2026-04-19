// api/notifications.js
// Gestion complète des notifications Free/Premium en un seul endpoint
// GET  ?action=get&piUserId=xxx
// POST { action: 'read'|'generate', piUserId, ...params }
//
// get      (GET)  : { piUserId }
// read     (POST) : { piUserId, notifId? }  — notifId absent = tout marquer lu
// generate (POST) : sécurisé par x-cron-secret

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getUser, requirePremium } from './_userHelper.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db           = getFirestore();
const JIKAN        = 'https://api.jikan.moe/v4';
const CRON_SECRET  = process.env.CRON_SECRET;

/* ── Types de notifications (extensible) ────────────────────────────────
   Pour ajouter un type : ajouter ici + créer generate{Type}() ci-dessous
──────────────────────────────────────────────────────────────────────── */
const NOTIF_TYPES = {
  new_episode:    { tier: 'free',    icon: '📺' },
  recommendation: { tier: 'premium', icon: '✨' },
  trending:       { tier: 'premium', icon: '📈' },
  similar:        { tier: 'premium', icon: '🎯' },
};

/* ── Helpers ── */

async function jikanGet(path) {
  const res = await fetch(`${JIKAN}${path}`);
  if (!res.ok) throw new Error(`Jikan ${res.status}`);
  await new Promise(r => setTimeout(r, 400));
  return res.json();
}

async function notifExists(userRef, type, animeId) {
  const since = Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000);
  const snap  = await userRef.collection('notifications')
    .where('type', '==', type)
    .where('animeId', '==', animeId)
    .where('createdAt', '>', since)
    .limit(1).get();
  return !snap.empty;
}

async function pushNotif(userRef, { type, animeId, animeTitle, animeImg, message }) {
  const def = NOTIF_TYPES[type];
  if (!def) return;
  await userRef.collection('notifications').add({
    type, tier: def.tier, icon: def.icon,
    animeId: animeId || null, animeTitle: animeTitle || '',
    animeImg: animeImg || '', message, read: false, createdAt: Timestamp.now(),
  });
}

/* ── Générateurs ── */
async function generateNewEpisode(userRef, favs) {
  let count = 0;
  for (const fav of (favs || []).slice(0, 10)) {
    try {
      const { data: anime } = await jikanGet(`/anime/${fav.id}`);
      if (!anime || anime.status !== 'Currently Airing') continue;
      if (await notifExists(userRef, 'new_episode', anime.mal_id)) continue;
      await pushNotif(userRef, {
        type: 'new_episode', animeId: anime.mal_id,
        animeTitle: anime.title_english || anime.title,
        animeImg:   anime.images?.jpg?.image_url || '',
        message:    `📺 New episode available for ${anime.title_english || anime.title}`,
      });
      count++;
    } catch (_) {}
  }
  return count;
}

async function generateRecommendation(userRef, favs) {
  if (!favs?.length) return 0;
  try {
    const { data: recs } = await jikanGet(`/anime/${favs[0].id}/recommendations`);
    for (const rec of (recs || []).slice(0, 5)) {
      const anime = rec.entry;
      if (await notifExists(userRef, 'recommendation', anime.mal_id)) continue;
      await pushNotif(userRef, {
        type: 'recommendation', animeId: anime.mal_id, animeTitle: anime.title,
        animeImg: anime.images?.jpg?.image_url || '',
        message:  `✨ Recommended based on your favorites: ${anime.title}`,
      });
      return 1;
    }
  } catch (_) {}
  return 0;
}

async function generateTrending(userRef) {
  try {
    const snap = await db.collection('stats').doc('views').collection('anime')
      .orderBy('count', 'desc').limit(5).get();
    for (const doc of snap.docs) {
      const animeId = parseInt(doc.id);
      if (!animeId || await notifExists(userRef, 'trending', animeId)) continue;
      const { data: anime } = await jikanGet(`/anime/${animeId}`);
      if (!anime) continue;
      await pushNotif(userRef, {
        type: 'trending', animeId,
        animeTitle: anime.title_english || anime.title,
        animeImg:   anime.images?.jpg?.image_url || '',
        message:    `📈 Trending on VoirAnime: ${anime.title_english || anime.title}`,
      });
      return 1;
    }
  } catch (_) {}
  return 0;
}

async function generateSimilar(userRef, favs) {
  if (!favs?.length) return 0;
  try {
    const pick = favs[Math.floor(Math.random() * Math.min(favs.length, 5))];
    const { data: recs } = await jikanGet(`/anime/${pick.id}/recommendations`);
    const pick2 = (recs || [])[Math.floor(Math.random() * Math.min((recs || []).length, 10))];
    if (!pick2) return 0;
    const anime = pick2.entry;
    if (await notifExists(userRef, 'similar', anime.mal_id)) return 0;
    await pushNotif(userRef, {
      type: 'similar', animeId: anime.mal_id, animeTitle: anime.title,
      animeImg: anime.images?.jpg?.image_url || '',
      message:  `🎯 Similar to ${pick.title}: ${anime.title}`,
    });
    return 1;
  } catch (_) {}
  return 0;
}

/* ── Actions ── */
async function actionGet(piUserId) {
  const { ref, data: userData, isPremium } = await getUser(piUserId);

  const snapshot = await ref.collection('notifications')
    .orderBy('createdAt', 'desc').limit(50).get();

  const allNotifs = snapshot.docs.map(doc => ({
    id: doc.id, ...doc.data(),
    createdAt: doc.data().createdAt?.toMillis() || Date.now(),
  }));

  const notifs = isPremium ? allNotifs : allNotifs.filter(n => n.tier === 'free');

  return [200, {
    ok: true, isPremium,
    expiresAt: userData.expiresAt?.toMillis() || null,
    notifications: notifs,
    unreadCount: notifs.filter(n => !n.read).length,
  }];
}

async function actionRead(piUserId, { notifId }) {
  const ref     = db.collection('users').doc(piUserId);
  const notifsRef = ref.collection('notifications');

  if (notifId) {
    await notifsRef.doc(notifId).update({ read: true });
  } else {
    const snap = await notifsRef.where('read', '==', false).get();
    if (!snap.empty) {
      const batch = db.batch();
      snap.docs.forEach(doc => batch.update(doc.ref, { read: true }));
      await batch.commit();
    }
  }
  return [200, { ok: true }];
}

async function actionGenerate(secret) {
  if (CRON_SECRET && secret !== CRON_SECRET) return [401, { error: 'Unauthorized' }];

  const usersSnap = await db.collection('users').get();
  let totalNotifs = 0, usersProcessed = 0;

  for (const doc of usersSnap.docs) {
    const userData  = doc.data();
    if (!userData.favorites?.length) continue;
    const userRef   = doc.ref;
    const isPremium = (await getUser(doc.id)).isPremium; // via _userHelper — vérifie expiresAt
    try {
      totalNotifs += await generateNewEpisode(userRef, userData.favorites);
      if (isPremium) {
        totalNotifs += await generateRecommendation(userRef, userData.favorites);
        totalNotifs += await generateTrending(userRef);
        totalNotifs += await generateSimilar(userRef, userData.favorites);
      }
      usersProcessed++;
    } catch (e) {
      console.error(`[notifications] Error for ${doc.id}:`, e.message);
    }
  }

  // Expiration automatique : exécutée après chaque génération de notifs
  const expireResult = await actionExpire(secret, { _internal: true });

  return [200, {
    ok: true,
    usersProcessed,
    notifsGenerated: totalNotifs,
    expiredAccounts: expireResult[1]?.expired || 0,
  }];
}

/* ── Expiration automatique des abonnements ────────────────────────────────
   Parcourt tous les utilisateurs avec isPremium:true dont expiresAt est passé
   → met isPremium:false + plan:null + subscriptionStatus:'expired'
   Appelé automatiquement par actionGenerate (cron 9h UTC)
   ou manuellement : POST { action:'expire' } avec x-cron-secret
──────────────────────────────────────────────────────────────────────────── */
async function actionExpire(secret, opts = {}) {
  if (!opts._internal && CRON_SECRET && secret !== CRON_SECRET) {
    return [401, { error: 'Unauthorized' }];
  }

  const now  = Date.now();
  let expired = 0, errors = 0;

  // Requête ciblée : uniquement les isPremium:true (pas tous les users)
  const snap = await db.collection('users')
    .where('isPremium', '==', true)
    .get();

  if (snap.empty) return [200, { ok: true, expired: 0, checked: 0 }];

  // Traitement en batch (max 500 ops Firestore)
  const BATCH_SIZE = 400;
  let   batch      = db.batch();
  let   batchCount = 0;

  for (const doc of snap.docs) {
    const data        = doc.data();
    const expiresAtMs = data.expiresAt?.toMillis?.() || null;

    // Ignorer si pas de date d'expiration ou pas encore expiré
    if (!expiresAtMs || expiresAtMs > now) continue;

    try {
      batch.update(doc.ref, {
        isPremium: false,
        plan:      null,         // subscriptionType → none
      });
      batchCount++;
      expired++;

      // Commit par tranche de 400 pour ne pas dépasser la limite Firestore
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch      = db.batch();
        batchCount = 0;
      }
    } catch (e) {
      errors++;
      console.error(`[expire] Error for ${doc.id}:`, e.message);
    }
  }

  // Commit le reste
  if (batchCount > 0) await batch.commit();

  console.log(`[expire] Done — ${expired} expired, ${errors} errors, ${snap.size} checked`);
  return [200, { ok: true, expired, errors, checked: snap.size }];
}

/* ── Handler principal ── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let status, body;

    if (req.method === 'GET') {
      const { piUserId } = req.query;
      if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
      [status, body] = await actionGet(piUserId);

    } else if (req.method === 'POST') {
      const { action, piUserId, ...params } = req.body || {};
      const secret = req.headers['x-cron-secret'] || params.secret;

      if (action === 'generate') {
        [status, body] = await actionGenerate(secret);
      } else if (action === 'expire') {
        [status, body] = await actionExpire(secret);
      } else {
        if (!piUserId) return res.status(400).json({ error: 'piUserId required' });
        if (action === 'read') [status, body] = await actionRead(piUserId, params);
        else return res.status(400).json({ error: 'Unknown action: use read|generate|expire' });
      }
    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    return res.status(status).json(body);
  } catch (e) {
    console.error('[notifications]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
