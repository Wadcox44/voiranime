// api/notifications-read.js
// Marque des notifications comme lues (une ou toutes)
// POST { piUserId, notifId? }  — si notifId absent → marque tout comme lu

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { piUserId, notifId } = req.body || {};
  if (!piUserId) return res.status(400).json({ error: 'piUserId required' });

  try {
    const notifsRef = db
      .collection('users').doc(piUserId)
      .collection('notifications');

    if (notifId) {
      // Marquer une seule notification
      await notifsRef.doc(notifId).update({ read: true });
    } else {
      // Marquer tout comme lu — batch Firestore (max 500 ops)
      const snapshot = await notifsRef.where('read', '==', false).get();
      if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.update(doc.ref, { read: true }));
        await batch.commit();
      }
    }

    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('[notifications-read]', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
