// api/features.js
// Feature flags Free vs Premium par utilisateur
// GET /api/features?piUserId=xxx  (piUserId optionnel)
//
// Retourne :
// {
//   isPremium: bool,
//   features: {
//     featureId: {
//       accessible: bool,
//       reason: 'premium_only' | 'free' | 'early_access',
//       freeAt: timestamp | null,
//       daysUntilFree: number | null
//     }
//   }
// }
//
// Définition des features :
//   accessible: true  → tout le monde y a accès
//   accessible: false → Premium seulement (ou délai Early Access en cours)
//   freeAt            → date à laquelle la feature devient gratuite
//
// Pour ajouter une feature : l'ajouter dans FEATURE_DEFINITIONS ci-dessous

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';
import { checkRateLimit }                from './_rateLimit.js';

function initFirebase() {
  if (getApps().length) return;
  initializeApp({ credential: cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  })});
}

// ── Définition des features ───────────────────────────────────────────────────
// premiumOnly: true  → réservé aux abonnés Premium
// freeAfterDays: N   → devient gratuit N jours après le lancement (Early Access)
// freeAt: 'YYYY-MM-DD' → devient gratuit à une date fixe
// (si ni premiumOnly ni freeAt → toujours accessible)

const FEATURE_DEFINITIONS = {
  catalogue_v2: {
    premiumOnly:    false,
    freeAfterDays:  30,
    launchedAt:     '2025-06-01', // date de lancement de la feature
  },
  advanced_stats: {
    premiumOnly: true,
  },
  recommendations: {
    premiumOnly: true,
  },
  notifications_premium: {
    premiumOnly: true,
  },
  unlimited_favorites: {
    premiumOnly: true,
  },
  list_reorder: {
    premiumOnly: true,
  },
  early_access_news: {
    premiumOnly:   false,
    freeAfterDays: 14,
    launchedAt:    '2025-06-01',
  },
};

// ── Calcul du statut d'une feature pour un user ───────────────────────────────
function resolveFeature(featureId, def, isPremium) {
  // Feature inconnue = toujours accessible
  if (!def) return { accessible: true, reason: 'unknown' };

  // Premium → accès à tout
  if (isPremium) return { accessible: true, reason: 'premium' };

  // Feature réservée Premium sans date de libération
  if (def.premiumOnly && !def.freeAfterDays && !def.freeAt) {
    return { accessible: false, reason: 'premium_only', freeAt: null, daysUntilFree: null };
  }

  // Early Access : calcul de la date de libération
  let freeAtMs = null;
  if (def.freeAt) {
    freeAtMs = new Date(def.freeAt).getTime();
  } else if (def.freeAfterDays && def.launchedAt) {
    freeAtMs = new Date(def.launchedAt).getTime() + def.freeAfterDays * 86400000;
  }

  if (freeAtMs) {
    const now = Date.now();
    if (now >= freeAtMs) {
      // Délai écoulé → accessible à tous
      return { accessible: true, reason: 'free', freeAt: freeAtMs };
    }
    // Encore en Early Access
    const daysUntilFree = Math.ceil((freeAtMs - now) / 86400000);
    return {
      accessible:    false,
      reason:        'early_access',
      freeAt:        freeAtMs,
      daysUntilFree,
    };
  }

  // Pas de restriction
  return { accessible: true, reason: 'free' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting : 60 requêtes/minute par IP
  const limited = await checkRateLimit(req, 'features', 60, 60);
  if (limited) return res.status(429).json({ error: 'Too many requests', retryAfter: 60 });

  const { piUserId } = req.query || {};

  try {
    let isPremium = false;
    let userFlags = {}; // flags individuels éventuels

    if (piUserId) {
      initFirebase();
      const db  = getFirestore();
      const doc = await db.collection('users').doc(piUserId).get();

      if (doc.exists) {
        const data  = doc.data();
        const now   = Date.now();
        const expMs = data.expiresAt?.toMillis?.() || 0;

        isPremium = !!(data.isPremium && expMs > now);
        userFlags = data.flags || {};
      }
    }

    // Résoudre chaque feature
    const features = {};
    for (const [id, def] of Object.entries(FEATURE_DEFINITIONS)) {
      // Flag individuel override
      if (userFlags[id] === true)  { features[id] = { accessible: true,  reason: 'user_flag' }; continue; }
      if (userFlags[id] === false) { features[id] = { accessible: false, reason: 'user_flag' }; continue; }

      features[id] = resolveFeature(id, def, isPremium);
    }

    return res.status(200).json({ ok: true, isPremium, features });

  } catch(e) {
    console.error('[features]', e);
    return res.status(500).json({ error: 'Server error', message: e.message });
  }
}
