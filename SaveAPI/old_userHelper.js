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

import { getFirestore, Timestamp } from 'firebase-admin/firestore';

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

  // Auto-nettoyage Firestore : si le flag est true mais expiré → le corriger
  // Évite qu'un contournement de getUser() accorde un accès Premium expiré
  if (data.isPremium === true && expiresAtMs !== null && expiresAtMs <= now) {
    ref.update({ isPremium: false }).catch(() => {}); // non bloquant
  }

  // subscriptionStatus : état lisible de l'abonnement
  let subscriptionStatus = 'none';
  if (isPremium)             subscriptionStatus = 'active';
  else if (expiresAtMs)      subscriptionStatus = 'expired';

  const daysLeft  = isPremium ? Math.max(0, Math.ceil((expiresAtMs - now) / 86400000)) : 0;
  const willRenew = data.willCancel !== true;

  return {
    ref,
    data,
    isPremium,
    subscriptionStatus,
    plan:       data.plan || null,
    expiresAt:  expiresAtMs,
    daysLeft,
    willRenew,
    piUsername: data.piUsername || '',
  };
}

/* ── Middleware Premium ────────────────────────────────────────────────────
   Utilisation dans un handler :

     const guard = await requirePremium(piUserId, 'favorites_reorder');
     if (guard) return res.status(guard.status).json(guard.body);
     // ici : isPremium confirmé ✅

   Retourne null si Premium OK, ou { status, body } à renvoyer immédiatement.

   Table des features Premium protégées par ce middleware :
   ┌─────────────────────────────┬──────────────┬────────────────────────────┐
   │ Feature                     │ Fichier      │ Action                     │
   ├─────────────────────────────┼──────────────┼────────────────────────────┤
   │ favorites_reorder           │ favorites.js │ actionReorder              │
   │ subscription_cancel         │ premium.js   │ actionCancel               │
   │ (filtre notifs, pas bloqué) │ notif.js     │ actionGet — filtre interne │
   └─────────────────────────────┴──────────────┴────────────────────────────┘

   Pour protéger une nouvelle feature :
     1. Choisir un featureName descriptif
     2. Ajouter une ligne dans la table ci-dessus
     3. const guard = await requirePremium(piUserId, 'nom_feature');
        if (guard) return [guard.status, guard.body];
──────────────────────────────────────────────────────────────────────────── */

// Messages par feature — personnalisables
const FEATURE_MESSAGES = {
  favorites_reorder:   'Reordering favorites requires a Premium subscription.',
  subscription_cancel: 'No active subscription to cancel.',
  stats_access:        'Detailed stats require a Premium subscription.',
  early_access:        'Early access requires a Premium subscription.',
  default:             'This feature requires a Premium subscription.',
};

export async function requirePremium(piUserId, featureName = 'default') {
  if (!piUserId) {
    return { status: 400, body: { error: 'piUserId required' } };
  }

  const { isPremium, subscriptionStatus, daysLeft } = await getUser(piUserId);

  if (!isPremium) {
    const featureMsg = FEATURE_MESSAGES[featureName] || FEATURE_MESSAGES.default;
    return {
      status: 403,
      body: {
        error:              'PREMIUM_REQUIRED',
        feature:            featureName,
        subscriptionStatus, // 'expired' | 'none'
        message: subscriptionStatus === 'expired'
          ? `Your Premium subscription has expired. ${featureMsg}`
          : featureMsg,
        upgradeUrl: 'https://voir-anime.vercel.app/soutenir',
      },
    };
  }

  return null; // accès autorisé
}
