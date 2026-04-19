// api/notifications-get.js
// Retourne les notifications de l'utilisateur selon son tier (free/premium)
// Sécurité : vérification isPremium côté serveur — le client ne filtre jamais

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  const { piUserId } = req.query;
  if (!piUserId) return res.status(400).json({ error: 'piUserId required' });

  try {
    // ── 1. Vérifier le statut Premium côté serveur ──────────────────────────
    const userDoc  = await db.collection('users').doc(piUserId).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const now      = Date.now();

    const isPremium = userData.isPremium === true
      && userData.expiresAt
      && userData.expiresAt.toMillis() > now;

    // ── 2. Récupérer les notifications (50 dernières) ────────────────────────
    const snapshot = await db
      .collection('users').doc(piUserId)
      .collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const allNotifs = snapshot.docs.map(doc => ({
      id:        doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || now,
    }));

    // ── 3. Filtrage serveur selon tier ───────────────────────────────────────
    // Free  → uniquement tier:'free'
    // Premium → tout (free + premium)
    const notifs = isPremium
      ? allNotifs
      : allNotifs.filter(n => n.tier === 'free');

    return res.status(200).json({
      ok:            true,
      isPremium,
      expiresAt:     userData.expiresAt?.toMillis() || null,
      notifications: notifs,
      unreadCount:   notifs.filter(n => !n.read).length,
    });

  } catch (e) {
    console.error('[notifications-get]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
