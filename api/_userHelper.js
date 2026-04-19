// api/_userHelper.js
// Helper partagé — lecture et calcul du statut utilisateur Premium
// Importé par favorites.js, notifications.js, features.js, premium.js
//
// Schéma Firestore users/{piUserId} :
//   isPremium:   boolean   — true si abonnement actif et non expiré
//   plan:        string    — 'monthly' | 'annual' | null
//   expiresAt:   Timestamp — date d'expiration de l'abonnement
//   activatedAt: Timestamp — date de première activation
//   renewedAt:   Timestamp — date du dernier renouvellement
//   willCancel:  boolean   — true si annulation demandée (pas de renouvellement)
//   piUsername:  string    — pseudo Pi Network
//   favorites:   array     — [{id, title, img}] pour les notifications
//   favoritesOrder: array  — [id, id, ...] ordre personnalisé (Premium)
//
// subscriptionStatus calculé (jamais stocké, toujours dérivé) :
//   'active'  → isPremium && expiresAt > now
//   'expired' → isPremium=false && expiresAt existe && expiresAt < now
//   'none'    → jamais eu d'abonnement

import { getFirestore } from 'firebase-admin/firestore';

// Pas d'initializeApp ici — chaque fichier appelant l'initialise déjà

export async function getUser(piUserId) {
  const db  = getFirestore();
  const ref = db.collection('users').doc(piUserId);
  const doc = await ref.get();
  const data = doc.exists ? doc.data() : {};
  const now  = Date.now();

  const expiresAtMs = data.expiresAt?.toMillis?.() || null;

  // isPremium : vrai uniquement si flag actif ET date non expirée
  const isPremium = data.isPremium === true
    && expiresAtMs !== null
    && expiresAtMs > now;

  // subscriptionStatus : état lisible de l'abonnement
  let subscriptionStatus = 'none';
  if (isPremium) {
    subscriptionStatus = 'active';
  } else if (expiresAtMs !== null) {
    subscriptionStatus = 'expired'; // a eu un abonnement mais il est terminé
  }

  const daysLeft  = isPremium ? Math.max(0, Math.ceil((expiresAtMs - now) / 86400000)) : 0;
  const willRenew = data.willCancel !== true;

  return {
    ref,
    data,
    isPremium,
    subscriptionStatus,           // 'active' | 'expired' | 'none'
    plan:        data.plan || null,           // 'monthly' | 'annual' | null
    expiresAt:   expiresAtMs,                 // ms timestamp ou null
    daysLeft,
    willRenew,
    piUsername:  data.piUsername || '',
  };
}
