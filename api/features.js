// api/features.js
// Gestion des feature flags Free vs Premium
// GET  ?piUserId=xxx           → liste toutes les features avec statut d'accès
// POST { action:'add', ...}    → ajoute une feature (admin seulement)
// POST { action:'toggle', ...} → active/désactive une feature (admin seulement)
//
// Firestore structure:
//   features/{featureId} → { name, description, releasedAt, enabled }
//   freeAt = releasedAt + FREE_DELAY_DAYS * 86400000 (calculé côté serveur)

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

const db               = getFirestore();
const FREE_DELAY_DAYS  = 15;
const FREE_DELAY_MS    = FREE_DELAY_DAYS * 24 * 3600 * 1000;
const ADMIN_SECRET     = process.env.ADMIN_SECRET; // variable Vercel pour les actions admin

/* ── Helpers ── */
async function getPremiumStatus(piUserId) {
  if (!piUserId) return false;
  const { isPremium } = await getUser(piUserId);
  return isPremium;
}

function computeFeatureAccess(feature, isPremium, now) {
  if (!feature.enabled) {
    return { accessible: false, reason: 'disabled' };
  }

  const releasedAt = feature.releasedAt?.toMillis?.() || 0;
  const freeAt     = releasedAt + FREE_DELAY_MS;

  if (isPremium) {
    // Premium : accès dès releasedAt
    return {
      accessible:   now >= releasedAt,
      isPremium:    true,
      releasedAt,
      freeAt,
      reason:       now >= releasedAt ? 'premium_access' : 'not_released_yet',
    };
  } else {
    // Free : accès dès freeAt
    const daysLeft = Math.ceil((freeAt - now) / 86400000);
    return {
      accessible:   now >= freeAt,
      isPremium:    false,
      releasedAt,
      freeAt,
      daysUntilFree: Math.max(0, daysLeft),
      reason:       now >= freeAt ? 'free_access' : 'pending_free',
    };
  }
}

/* ── Actions ── */
async function actionGet(piUserId) {
  const now       = Date.now();
  const isPremium = await getPremiumStatus(piUserId);

  const snap     = await db.collection('features').orderBy('releasedAt', 'desc').get();
  const features = {};

  snap.docs.forEach(doc => {
    const data   = doc.data();
    const access = computeFeatureAccess(data, isPremium, now);

    features[doc.id] = {
      id:          doc.id,
      name:        data.name        || doc.id,
      description: data.description || '',
      ...access,
      // Ne jamais exposer les timestamps bruts au client Free
      // (évite qu'il calcule freeAt lui-même pour contourner)
      releasedAt: isPremium ? access.releasedAt : undefined,
      freeAt:     access.freeAt,
    };
  });

  return [200, { ok: true, isPremium, features }];
}

// Admin : ajouter une nouvelle feature
// POST { action:'add', name, description, featureId, releasedAt? }
async function actionAdd(params, adminSecret) {
  if (ADMIN_SECRET && adminSecret !== ADMIN_SECRET) {
    return [401, { error: 'Unauthorized' }];
  }

  const { featureId, name, description, releasedAt } = params;
  if (!featureId || !name) return [400, { error: 'featureId and name required' }];

  const releaseTs = releasedAt
    ? Timestamp.fromMillis(new Date(releasedAt).getTime())
    : Timestamp.now();

  await db.collection('features').doc(featureId).set({
    name,
    description: description || '',
    releasedAt:  releaseTs,
    enabled:     true,
    createdAt:   Timestamp.now(),
  });

  const freeDate = new Date(releaseTs.toMillis() + FREE_DELAY_MS);
  return [200, {
    ok: true,
    featureId,
    releasedAt: releaseTs.toMillis(),
    freeAt:     freeDate.toISOString(),
    freeDate:   freeDate.toLocaleDateString('en-US', { day:'numeric', month:'long', year:'numeric' }),
  }];
}

// Admin : activer / désactiver une feature (kill switch)
// POST { action:'toggle', featureId, enabled }
async function actionToggle(params, adminSecret) {
  if (ADMIN_SECRET && adminSecret !== ADMIN_SECRET) {
    return [401, { error: 'Unauthorized' }];
  }

  const { featureId, enabled } = params;
  if (!featureId) return [400, { error: 'featureId required' }];

  await db.collection('features').doc(featureId).update({
    enabled: enabled !== false, // true par défaut
  });

  return [200, { ok: true, featureId, enabled: enabled !== false }];
}

/* ── Handler ── */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { piUserId } = req.query;
      const [status, body] = await actionGet(piUserId || null);
      return res.status(status).json(body);
    }

    if (req.method === 'POST') {
      const { action, ...params } = req.body || {};
      const adminSecret = req.headers['x-admin-secret'] || params.adminSecret;

      let status, body;
      if      (action === 'add')    [status, body] = await actionAdd(params, adminSecret);
      else if (action === 'toggle') [status, body] = await actionToggle(params, adminSecret);
      else return res.status(400).json({ error: 'Unknown action: use add|toggle' });

      return res.status(status).json(body);
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (e) {
    console.error('[features]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
