/* ═══════════════════════════════════════════════════════
   firebase.js — VoirAnime  [VERSION CORRIGÉE]
   Corrections : race condition setDoc, double lecture voteDuel,
                 index composite documenté, sécurité config
   ═══════════════════════════════════════════════════════ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  where,
  serverTimestamp,
  addDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/* ──────────────────────────────────────
   CONFIG FIREBASE
   ⚠ SÉCURITÉ : ta config est visible publiquement sur GitHub Pages.
   Deux actions obligatoires :
   1. Dans Google Cloud Console → APIs & Services → Credentials
      → Restreins ton apiKey aux domaines : ton-domaine.github.io
   2. Dans Firebase Console → Firestore → Rules, applique ces règles :

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       // Lecture publique, écriture uniquement sur les chemins autorisés
       match /stats/{document=**} {
         allow read: if true;
         allow write: if true; // passe à "if request.auth != null" si tu ajoutes Auth
       }
       match /events/{document} {
         allow read: if false;   // personne ne lit les events sauf getTopAnime()
         allow write: if true;
       }
     }
   }
────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "AIzaSyALvccfFRQkjkoTzoQdDcpASg-3UjoYFi8",
  authDomain:        "voir-anime.firebaseapp.com",
  projectId:         "voir-anime",
  storageBucket:     "voir-anime.firebasestorage.app",
  messagingSenderId: "9083405988",
  appId:             "1:9083405988:web:0b819ae034592ca4504831",
  measurementId:     "G-F1TT7CFSF0",
};

/* ──────────────────────────────────────
   INIT
────────────────────────────────────── */
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ──────────────────────────────────────
   UTILS INTERNES
────────────────────────────────────── */

/**
 * FIX Bug 9 : utilise setDoc avec merge:true + increment() de Firestore
 * pour être atomique et éviter la race condition de la version précédente.
 *
 * Avant : on lisait d'abord (getDoc), puis on écrivait selon le résultat
 * → si deux clients lisent simultanément "document inexistant",
 *   tous deux font setDoc avec total:1 → le second écrase le premier.
 *
 * Après : setDoc avec merge:true + increment() est atomique côté serveur.
 */
async function _safeIncrement(docRef, fields) {
  try {
    // merge:true crée le document s'il n'existe pas, sans écraser les champs existants
    await setDoc(docRef, fields, { merge: true });
  } catch (e) {
    console.warn('[VoirAnime Firebase] Erreur increment:', e.message);
  }
}

/* ══════════════════════════════════════
   TRACKING — VUES
══════════════════════════════════════ */

/**
 * trackView(animeId)
 * Chemin Firestore : stats/views/anime/{animeId}
 */
export async function trackView(animeId) {
  if (!animeId) return;
  const id = String(animeId);

  // FIX : _safeIncrement atomique (plus de lecture préalable)
  const ref = doc(db, 'stats', 'views', 'anime', id);
  await _safeIncrement(ref, {
    total:    increment(1),
    lastSeen: serverTimestamp(),
  });

  // Log pour trending
  try {
    await addDoc(collection(db, 'events'), {
      type:      'view',
      animeId:   id,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[VoirAnime Firebase] Erreur log event view:', e.message);
  }

  console.debug(`[VoirAnime] 👁 Vue trackée → anime ${id}`);
}

/* ══════════════════════════════════════
   TRACKING — CLICS STREAMING
══════════════════════════════════════ */

/**
 * trackClick(platform, animeId)
 * Chemin Firestore : stats/clicks/{platform}/{animeId}
 */
export async function trackClick(platform, animeId) {
  if (!platform || !animeId) return;
  const id = String(animeId);
  const p  = platform.toLowerCase();

  const ref = doc(db, 'stats', 'clicks', p, id);
  await _safeIncrement(ref, {
    total:     increment(1),
    lastClick: serverTimestamp(),
  });

  try {
    await addDoc(collection(db, 'events'), {
      type:      'click',
      platform:  p,
      animeId:   id,
      timestamp: serverTimestamp(),
    });
  } catch (e) {
    console.warn('[VoirAnime Firebase] Erreur log event click:', e.message);
  }

  console.debug(`[VoirAnime] 🖱 Clic tracké → ${p} · anime ${id}`);
}

/* ══════════════════════════════════════
   TOP ANIME
══════════════════════════════════════ */

/**
 * getTopAnime(n)
 * Fusionne vues + clics pour produire un classement.
 */
export async function getTopAnime(n = 10) {
  try {
    const viewsQ    = query(
      collection(db, 'stats', 'views', 'anime'),
      orderBy('total', 'desc'),
      limit(50)
    );
    const viewsSnap = await getDocs(viewsQ);

    const platforms = ['crunchyroll', 'netflix', 'adn'];
    const clickMap  = {};

    for (const platform of platforms) {
      try {
        const clicksQ    = query(
          collection(db, 'stats', 'clicks', platform),
          orderBy('total', 'desc'),
          limit(50)
        );
        const clicksSnap = await getDocs(clicksQ);
        clicksSnap.forEach(d => {
          clickMap[d.id] = (clickMap[d.id] || 0) + (d.data().total || 0);
        });
      } catch (_) { /* plateforme vide → ok */ }
    }

    const scores = {};
    viewsSnap.forEach(d => {
      const aid     = d.id;
      const views   = d.data().total || 0;
      const clicks  = clickMap[aid]  || 0;
      scores[aid]   = { animeId: aid, views, clicks, score: views + clicks * 3 };
    });

    for (const [aid, clicks] of Object.entries(clickMap)) {
      if (!scores[aid]) {
        scores[aid] = { animeId: aid, views: 0, clicks, score: clicks * 3 };
      }
    }

    return Object.values(scores)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);

  } catch (e) {
    console.warn('[VoirAnime Firebase] getTopAnime error:', e.message);
    return [];
  }
}

/* ══════════════════════════════════════
   TRENDING
   FIX Bug 11 : index composite requis dans Firebase Console.
   Va dans Firestore → Indexes → Composite → Ajoute :
     Collection : events
     Champs     : timestamp ASC, __name__ ASC
   Sans cet index, la query échoue silencieusement.
══════════════════════════════════════ */

/**
 * getTrendingAnime(n, hoursBack)
 * ⚠ Nécessite un index composite Firestore sur la collection 'events' :
 *   timestamp (ASC) + __name__ (ASC)
 *   → Firebase Console → Firestore → Indexes → Create composite index
 */
export async function getTrendingAnime(n = 10, hoursBack = 24) {
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const eventsQ = query(
      collection(db, 'events'),
      where('timestamp', '>=', since),
      orderBy('timestamp', 'desc'),
      limit(500)
    );

    const snap     = await getDocs(eventsQ);
    const trendMap = {};

    snap.forEach(d => {
      const { type, animeId } = d.data();
      if (!animeId) return;
      if (!trendMap[animeId]) trendMap[animeId] = { animeId, views: 0, clicks: 0, score: 0 };
      if (type === 'view')  { trendMap[animeId].views++;  trendMap[animeId].score += 1; }
      if (type === 'click') { trendMap[animeId].clicks++; trendMap[animeId].score += 3; }
    });

    return Object.values(trendMap)
      .sort((a, b) => b.score - a.score)
      .slice(0, n);

  } catch (e) {
    console.warn('[VoirAnime Firebase] getTrendingAnime error:', e.message);
    // Si l'erreur est liée à l'index manquant, Firestore logue un lien dans la console
    // pour créer l'index automatiquement.
    return [];
  }
}

/* ══════════════════════════════════════
   DUELS
══════════════════════════════════════ */

/**
 * getDuelData(duelId)
 */
export async function getDuelData(duelId) {
  try {
    const ref  = doc(db, 'stats', 'duels', 'battles', duelId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[VoirAnime Firebase] getDuelData error:', e.message);
    return null;
  }
}

/**
 * voteDuel(animeIdA, animeIdB, winner)
 * FIX Bug 10 : suppression de la double lecture Firestore.
 * On retourne les valeurs optimistes sans re-lire le document.
 * L'affichage restera cohérent ; la vraie valeur en BDD est correcte.
 */
export async function voteDuel(animeIdA, animeIdB, winner) {
  const [idA, idB] = [String(animeIdA), String(animeIdB)].sort();
  const duelId     = `${idA}_${idB}`;

  const isWinnerA =
    (winner === 'A' && idA === String(animeIdA)) ||
    (winner === 'B' && idA === String(animeIdB));

  const ref  = doc(db, 'stats', 'duels', 'battles', duelId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const current = snap.data();
    // FIX Bug 10 : updateDoc + retour optimiste (économise 1 lecture Firestore)
    const field   = isWinnerA ? { votesA: increment(1) } : { votesB: increment(1) };
    await updateDoc(ref, field);

    // Retour optimiste : incrémente localement sans re-lire
    return {
      votesA: (current.votesA || 0) + (isWinnerA ? 1 : 0),
      votesB: (current.votesB || 0) + (isWinnerA ? 0 : 1),
    };
  } else {
    // Nouveau duel
    const data = {
      animeA:    idA,
      animeB:    idB,
      votesA:    isWinnerA ? 1 : 0,
      votesB:    isWinnerA ? 0 : 1,
      createdAt: serverTimestamp(),
    };
    await setDoc(ref, data);
    return { votesA: data.votesA, votesB: data.votesB };
  }
}

export { db };
