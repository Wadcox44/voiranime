/* ═══════════════════════════════════════════════════════
   firebase.js — VoirAnime · Firebase Tracking Module
   Fonctions : trackView · trackClick · getTopAnime · getTrendingAnime
   ═══════════════════════════════════════════════════════

   SETUP :
   1. Va sur https://console.firebase.google.com
   2. Crée un projet → Firestore Database (mode test)
   3. Paramètres du projet → Tes applications → Web → copie la config
   4. Remplace les valeurs PLACEHOLDER ci-dessous par ta config
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
   🔧 CONFIG — REMPLACE CES VALEURS
────────────────────────────────────── */
const firebaseConfig = {
    apiKey: "AIzaSyALvccfFRQkjkoTzoQdDcpASg-3UjoYFi8",
  authDomain: "voir-anime.firebaseapp.com",
  projectId: "voir-anime",
  storageBucket: "voir-anime.firebasestorage.app",
  messagingSenderId: "9083405988",
  appId: "1:9083405988:web:0b819ae034592ca4504831",
  measurementId: "G-F1TT7CFSF0"
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
 * Incrémente un champ dans un document Firestore.
 * Crée le document s'il n'existe pas.
 */
async function _increment(docRef, fields) {
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, fields);
    } else {
      // Initialise avec les valeurs en remplacement d'increment()
      const init = {};
      for (const key of Object.keys(fields)) {
       init[key] = key === "lastSeen" || key === "lastClick"
  ? serverTimestamp()
  : 1;
      }
      await setDoc(docRef, { ...init, createdAt: serverTimestamp() });
    }
  } catch (e) {
    console.warn('[VoirAnime Firebase] Erreur increment:', e.message);
  }
}

/* ══════════════════════════════════════
   PARTIE 1 — TRACKING
══════════════════════════════════════ */

/**
 * trackView(animeId)
 * Enregistre une vue pour un anime.
 * Chemin Firestore : stats/views/anime/{animeId}
 * Document : { total: number, lastSeen: timestamp }
 *
 * @param {number|string} animeId  — ID MAL de l'anime
 */
export async function trackView(animeId) {
  if (!animeId) return;
  const id = String(animeId);

  // Compteur global
  const ref = doc(db, 'stats', 'views', 'anime', id);
  await _increment(ref, { total: increment(1), lastSeen: serverTimestamp() });

  // Log horodaté pour le trending (collection d'événements)
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

/**
 * trackClick(platform, animeId)
 * Enregistre un clic sur un lien streaming.
 * Chemin Firestore : stats/clicks/{platform}/{animeId}
 * Document : { total: number, lastClick: timestamp }
 *
 * @param {'crunchyroll'|'netflix'|'adn'} platform
 * @param {number|string} animeId
 */
export async function trackClick(platform, animeId) {
  if (!platform || !animeId) return;
  const id = String(animeId);
  const p  = platform.toLowerCase();

  // Compteur par plateforme
  const ref = doc(db, 'stats', 'clicks', p, id);
  await _increment(ref, { total: increment(1), lastClick: serverTimestamp() });

  // Log horodaté pour le trending
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

  console.debug(`[VoirAnime] 🖱 Clic trackée → ${p} · anime ${id}`);
}

/* ══════════════════════════════════════
   PARTIE 2 — TOP ANIME
══════════════════════════════════════ */

/**
 * getTopAnime(n)
 * Retourne les N animés les plus populaires
 * basé sur : (clics toutes plateformes) + vues
 *
 * @param {number} n  — nombre de résultats souhaités (défaut: 10)
 * @returns {Promise<Array<{animeId:string, score:number, views:number, clicks:number}>>}
 */
export async function getTopAnime(n = 10) {
  try {
    // 1. Récupère les top vues
    const viewsQ = query(
      collection(db, 'stats', 'views', 'anime'),
      orderBy('total', 'desc'),
      limit(50)
    );
    const viewsSnap = await getDocs(viewsQ);

    // 2. Récupère les top clics (toutes plateformes confondues)
    const platforms = ['crunchyroll', 'netflix', 'adn'];
    const clickMap  = {}; // animeId → total clics

    for (const platform of platforms) {
      try {
        const clicksQ = query(
          collection(db, 'stats', 'clicks', platform),
          orderBy('total', 'desc'),
          limit(50)
        );
        const clicksSnap = await getDocs(clicksQ);
        clicksSnap.forEach(d => {
          clickMap[d.id] = (clickMap[d.id] || 0) + d.data().total;
        });
      } catch (_) { /* plateforme sans données */ }
    }

    // 3. Fusion : score = vues + (clics × 3) → les clics comptent plus
    const scores = {};
    viewsSnap.forEach(d => {
      const aid = d.id;
      scores[aid] = {
        animeId: aid,
        views:   d.data().total || 0,
        clicks:  clickMap[aid] || 0,
        score:   (d.data().total || 0) + (clickMap[aid] || 0) * 3,
      };
    });

    // Anime avec clics mais pas encore de vues enregistrées
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
   PARTIE 3 — TRENDING (BONUS)
══════════════════════════════════════ */

/**
 * getTrendingAnime(n, hoursBack)
 * Retourne les animés trending basé sur les événements RÉCENTS.
 *
 * @param {number} n          — nombre de résultats (défaut: 10)
 * @param {number} hoursBack  — fenêtre temporelle en heures (défaut: 24h)
 * @returns {Promise<Array<{animeId:string, score:number}>>}
 */
export async function getTrendingAnime(n = 10, hoursBack = 24) {
  try {
    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

    const eventsQ = query(
      collection(db, 'events'),
      where('timestamp', '>=', since),
      orderBy('timestamp', 'desc'),
      limit(500) // analyse les 500 derniers événements
    );

    const snap = await getDocs(eventsQ);
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
    return [];
  }
}

/* ══════════════════════════════════════
   PARTIE 4 — DUELS
══════════════════════════════════════ */

/**
 * getDuelData(duelId)
 * Récupère les votes d'un duel existant.
 *
 * @param {string} duelId
 * @returns {Promise<{animeA:string, animeB:string, votesA:number, votesB:number}|null>}
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
 * Enregistre un vote de duel. Crée le document si nécessaire.
 * L'ID du duel est toujours trié pour éviter les doublons (A_B == B_A).
 *
 * @param {string} animeIdA
 * @param {string} animeIdB
 * @param {'A'|'B'} winner
 * @returns {Promise<{votesA:number, votesB:number}>}
 */
export async function voteDuel(animeIdA, animeIdB, winner) {
  // ID stable : toujours le plus petit ID en premier
  const [idA, idB] = [String(animeIdA), String(animeIdB)].sort();
  const duelId = `${idA}_${idB}`;

  // Détermine quel côté a gagné selon l'ordre canonique
  const isWinnerA = (winner === 'A' && idA === String(animeIdA)) ||
                    (winner === 'B' && idA === String(animeIdB));

  const ref  = doc(db, 'stats', 'duels', 'battles', duelId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const field = isWinnerA ? { votesA: increment(1) } : { votesB: increment(1) };
    await updateDoc(ref, field);
    const updated = (await getDoc(ref)).data();
    return { votesA: updated.votesA, votesB: updated.votesB };
  } else {
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

/* Export de l'instance db pour usage avancé */
export { db };
