// api/_rateLimit.js
// Helper rate limiting partagé — basé sur Firestore
// Commence par _ pour ne pas être compté comme fonction Vercel
//
// Usage dans un handler :
//   import { checkRateLimit } from './_rateLimit.js';
//   const limited = await checkRateLimit(req, 'premium', 30, 60);
//   if (limited) return res.status(429).json({ error: 'Too many requests' });
//
// checkRateLimit(req, namespace, maxRequests, windowSeconds)
//   namespace    : identifiant du groupe de limite (ex: 'premium', 'features')
//   maxRequests  : nombre max de requêtes autorisées dans la fenêtre
//   windowSeconds: durée de la fenêtre en secondes

import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Extraire l'IP depuis les headers Vercel/proxy
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

// Nettoyer l'IP pour en faire une clé Firestore valide
function sanitizeKey(ip) {
  return ip.replace(/[:.]/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

export async function checkRateLimit(req, namespace = 'default', maxRequests = 30, windowSeconds = 60) {
  try {
    const db      = getFirestore();
    const ip      = getIP(req);
    const key     = sanitizeKey(ip);
    const now     = Date.now();
    const windowMs = windowSeconds * 1000;
    const docRef  = db.collection('_ratelimits').doc(`${namespace}_${key}`);

    const doc = await docRef.get();

    if (!doc.exists) {
      // Première requête — créer le compteur
      await docRef.set({
        count:     1,
        windowStart: now,
        ip,
        namespace,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return false; // pas limité
    }

    const data = doc.data();
    const windowStart = data.windowStart || 0;

    if (now - windowStart > windowMs) {
      // Fenêtre expirée — reset
      await docRef.set({
        count:       1,
        windowStart: now,
        ip,
        namespace,
        updatedAt:   FieldValue.serverTimestamp(),
      });
      return false;
    }

    if (data.count >= maxRequests) {
      // Limite atteinte
      console.warn(`[rate-limit] ${namespace} — IP ${ip} blocked (${data.count}/${maxRequests})`);
      return true; // limité
    }

    // Incrémenter
    await docRef.update({
      count:     FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return false;

  } catch(e) {
    // En cas d'erreur DB, laisser passer (fail open)
    console.error('[rate-limit] Error:', e.message);
    return false;
  }
}

// Nettoyage des vieilles entrées (appelé depuis cron-stats)
export async function cleanRateLimits() {
  try {
    const db      = getFirestore();
    const cutoff  = Date.now() - 24 * 3600 * 1000; // entrées > 24h
    const snap    = await db.collection('_ratelimits')
      .where('windowStart', '<', cutoff)
      .limit(500)
      .get();
    if (snap.empty) return 0;
    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    return snap.size;
  } catch(e) {
    console.error('[rate-limit] Clean error:', e.message);
    return 0;
  }
}
