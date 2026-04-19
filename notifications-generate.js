// api/notifications-generate.js
// Génère les notifications pour tous les utilisateurs
// Appelé par un cron Vercel (vercel.json) ou manuellement
//
// Types générés :
//   FREE    → new_episode   : nouvel épisode d'un anime en favoris
//   PREMIUM → recommendation: suggestion basée sur l'historique
//   PREMIUM → trending      : anime tendance sur VoirAnime
//   PREMIUM → similar       : anime similaire à un favori récent
//
// Extensible : ajouter un type = ajouter une fonction generate*() ci-dessous

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

const db      = getFirestore();
const JIKAN   = 'https://api.jikan.moe/v4';
const CRON_SECRET = process.env.CRON_SECRET; // Variable Vercel pour sécuriser le cron

/* ── Définition des types de notifications ─────────────────────────────────
   Pour ajouter un type :
   1. Ajouter une entrée dans NOTIF_TYPES
   2. Créer une fonction generate{Type}()
   3. L'appeler dans generateForUser() avec le bon tier check
──────────────────────────────────────────────────────────────────────────── */
const NOTIF_TYPES = {
  new_episode:    { tier: 'free',    icon: '📺', label: 'New episode' },
  recommendation: { tier: 'premium', icon: '✨', label: 'Recommendation' },
  trending:       { tier: 'premium', icon: '📈', label: 'Trending' },
  similar:        { tier: 'premium', icon: '🎯', label: 'Similar anime' },
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
async function jikanGet(path) {
  const res = await fetch(`${JIKAN}${path}`);
  if (!res.ok) throw new Error(`Jikan ${res.status}: ${path}`);
  await new Promise(r => setTimeout(r, 400)); // rate limit 3 req/s
  return res.json();
}

async function notifExists(userRef, type, animeId) {
  // Évite les doublons : max 1 notif du même type par anime par 7 jours
  const since = Timestamp.fromMillis(Date.now() - 7 * 24 * 3600 * 1000);
  const snap = await userRef
    .collection('notifications')
    .where('type', '==', type)
    .where('animeId', '==', animeId)
    .where('createdAt', '>', since)
    .limit(1)
    .get();
  return !snap.empty;
}

async function pushNotif(userRef, { type, animeId, animeTitle, animeImg, message }) {
  const def = NOTIF_TYPES[type];
  if (!def) throw new Error(`Unknown notif type: ${type}`);

  await userRef.collection('notifications').add({
    type,
    tier:       def.tier,
    icon:       def.icon,
    animeId:    animeId || null,
    animeTitle: animeTitle || '',
    animeImg:   animeImg || '',
    message,
    read:       false,
    createdAt:  Timestamp.now(),
  });
}

/* ── Générateurs par type ────────────────────────────────────────────────── */

// FREE — Vérifie si un anime favori a un nouvel épisode
async function generateNewEpisode(userRef, favs) {
  if (!favs || favs.length === 0) return 0;
  let count = 0;

  for (const fav of favs.slice(0, 10)) {
    try {
      const data  = await jikanGet(`/anime/${fav.id}`);
      const anime = data.data;
      if (!anime || anime.status !== 'Currently Airing') continue;

      const animeId = anime.mal_id;
      const exists  = await notifExists(userRef, 'new_episode', animeId);
      if (exists) continue;

      await pushNotif(userRef, {
        type:       'new_episode',
        animeId,
        animeTitle: anime.title_english || anime.title,
        animeImg:   anime.images?.jpg?.image_url || '',
        message:    `📺 New episode available for ${anime.title_english || anime.title}`,
      });
      count++;
    } catch (_) {}
  }
  return count;
}

// PREMIUM — Recommandation basée sur les genres des favoris
async function generateRecommendation(userRef, favs) {
  if (!favs || favs.length === 0) return 0;

  try {
    // Prend le premier favori et cherche ses recommandations Jikan
    const fav  = favs[0];
    const data = await jikanGet(`/anime/${fav.id}/recommendations`);
    const recs = (data.data || []).slice(0, 5);

    for (const rec of recs) {
      const anime = rec.entry;
      const exists = await notifExists(userRef, 'recommendation', anime.mal_id);
      if (exists) continue;

      await pushNotif(userRef, {
        type:       'recommendation',
        animeId:    anime.mal_id,
        animeTitle: anime.title,
        animeImg:   anime.images?.jpg?.image_url || '',
        message:    `✨ Recommended based on your favorites: ${anime.title}`,
      });
      return 1; // 1 reco à la fois
    }
  } catch (_) {}
  return 0;
}

// PREMIUM — Anime tendance sur VoirAnime (top vues Firebase)
async function generateTrending(userRef) {
  try {
    // Récupère les trending depuis la collection Firebase stats
    const snap = await db
      .collection('stats').doc('views')
      .collection('anime')
      .orderBy('count', 'desc')
      .limit(5)
      .get();

    for (const doc of snap.docs) {
      const animeId = parseInt(doc.id);
      if (!animeId) continue;

      const exists = await notifExists(userRef, 'trending', animeId);
      if (exists) continue;

      const data  = await jikanGet(`/anime/${animeId}`);
      const anime = data.data;
      if (!anime) continue;

      await pushNotif(userRef, {
        type:       'trending',
        animeId,
        animeTitle: anime.title_english || anime.title,
        animeImg:   anime.images?.jpg?.image_url || '',
        message:    `📈 Trending on VoirAnime right now: ${anime.title_english || anime.title}`,
      });
      return 1;
    }
  } catch (_) {}
  return 0;
}

// PREMIUM — Anime similaire à un favori récent
async function generateSimilar(userRef, favs) {
  if (!favs || favs.length === 0) return 0;

  try {
    // Prend un favori aléatoire parmi les 5 derniers
    const pick = favs[Math.floor(Math.random() * Math.min(favs.length, 5))];
    const data = await jikanGet(`/anime/${pick.id}/recommendations`);
    const recs = (data.data || []);

    // Prend une reco différente de generateRecommendation
    const pick2 = recs[Math.floor(Math.random() * Math.min(recs.length, 10))];
    if (!pick2) return 0;

    const anime  = pick2.entry;
    const exists = await notifExists(userRef, 'similar', anime.mal_id);
    if (exists) return 0;

    await pushNotif(userRef, {
      type:       'similar',
      animeId:    anime.mal_id,
      animeTitle: anime.title,
      animeImg:   anime.images?.jpg?.image_url || '',
      message:    `🎯 Similar to ${pick.title}: ${anime.title}`,
    });
    return 1;
  } catch (_) {}
  return 0;
}

/* ── Génération pour un utilisateur ─────────────────────────────────────── */
async function generateForUser(userId, userData) {
  const userRef  = db.collection('users').doc(userId);
  const now      = Date.now();
  const isPremium = userData.isPremium === true
    && userData.expiresAt?.toMillis() > now;

  // Récupérer les favoris depuis Firestore (stockés par le client)
  const favs = userData.favorites || [];

  let total = 0;

  // FREE — toujours généré
  total += await generateNewEpisode(userRef, favs);

  // PREMIUM — uniquement si abonné vérifié serveur
  if (isPremium) {
    total += await generateRecommendation(userRef, favs);
    total += await generateTrending(userRef);
    total += await generateSimilar(userRef, favs);
  }

  return total;
}

/* ── Handler principal ───────────────────────────────────────────────────── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Sécuriser le cron : vérifier le secret
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Récupérer tous les utilisateurs avec favoris
    const usersSnap = await db.collection('users').get();
    let totalNotifs = 0;
    let usersProcessed = 0;

    for (const doc of usersSnap.docs) {
      const userData = doc.data();
      // Ignorer les users sans favoris
      if (!userData.favorites || userData.favorites.length === 0) continue;

      try {
        const count = await generateForUser(doc.id, userData);
        totalNotifs += count;
        usersProcessed++;
      } catch (e) {
        console.error(`[notifications-generate] Error for user ${doc.id}:`, e.message);
      }
    }

    return res.status(200).json({
      ok: true,
      usersProcessed,
      notifsGenerated: totalNotifs,
    });

  } catch (e) {
    console.error('[notifications-generate]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
