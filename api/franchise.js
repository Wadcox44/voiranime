/**
 * api/franchise.js — Vercel Serverless Function
 * Cache Firebase des données franchise Jikan.
 *
 * GET /api/franchise?id=20
 *
 * Flux :
 *   1. Vérifie Firestore (cache TTL 7 jours)
 *   2. Si présent → retourne immédiatement
 *   3. Si absent  → appelle Jikan, stocke dans Firestore, retourne
 *
 * Variables d'environnement Vercel requises :
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore }                  from 'firebase-admin/firestore';

/* ── Init Firebase Admin (singleton) ─────────────────────────────────── */
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel stocke \n littéralement dans les env vars → on les restaure
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db          = getFirestore();
const CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 jours en ms
const JIKAN_BASE  = 'https://api.jikan.moe/v4';
const DELAY_MS    = 420;

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Helpers Jikan (côté serveur, pas de rate limit partagé) ─────────── */
async function jikanGet(path) {
  await sleep(DELAY_MS);
  const res = await fetch(`${JIKAN_BASE}${path}`);
  if (res.status === 429) {
    await sleep(2000);
    const retry = await fetch(`${JIKAN_BASE}${path}`);
    if (!retry.ok) throw new Error(`Jikan ${retry.status} on ${path}`);
    return retry.json();
  }
  if (!res.ok) throw new Error(`Jikan ${res.status} on ${path}`);
  return res.json();
}

/* ── Construction de la franchise (même logique qu'animeFranchise.js) ── */
const TYPE_MAP          = { TV: 'seasons', Movie: 'movies', OVA: 'ova', Special: 'special', ONA: 'seasons' };
const MAIN_RELATIONS    = new Set(['prequel', 'sequel', 'side_story', 'alternative_version', 'full_story', 'summary']);
const SPINOFF_RELATIONS = new Set(['spin_off', 'character']);
const MAX_PER_CAT       = 8;
const MAX_SPINOFFS      = 5;

const byYear = (a, b) => {
  const ya = a.aired?.from ? new Date(a.aired.from).getFullYear() : 9999;
  const yb = b.aired?.from ? new Date(b.aired.from).getFullYear() : 9999;
  return ya - yb;
};

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(a => { if (seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true; });
}

async function buildFranchiseServer(animeId) {
  const result = { main: null, seasons: [], movies: [], ova: [], special: [], spinOff: [] };

  // Phase 1 : cartographie via /relations
  const visited    = new Set([animeId]);
  const memberIds  = new Set();
  const spinoffIds = new Set();
  const queue      = [{ id: animeId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (depth > 2) continue;

    let rels = [];
    try {
      const d = await jikanGet(`/anime/${id}/relations`);
      rels = d.data || [];
    } catch { continue; }

    for (const rel of rels) {
      for (const entry of rel.entry || []) {
        if (entry.type !== 'anime') continue;
        const eid = entry.mal_id;
        if (visited.has(eid)) continue;
        visited.add(eid);
        if (SPINOFF_RELATIONS.has(rel.relation))   spinoffIds.add(eid);
        else if (MAIN_RELATIONS.has(rel.relation)) { memberIds.add(eid); if (depth < 2) queue.push({ id: eid, depth: depth + 1 }); }
      }
    }
  }

  // Phase 2 : fetch /full pour root + membres
  let rootFull = null;
  try { const d = await jikanGet(`/anime/${animeId}/full`); rootFull = d.data || null; } catch {}
  if (!rootFull) return result;

  const membersFull = [];
  for (const id of [...memberIds].slice(0, MAX_PER_CAT * 3)) {
    try { const d = await jikanGet(`/anime/${id}/full`); if (d.data) membersFull.push(d.data); } catch {}
  }

  // Phase 3 : trouver le main
  const all = [rootFull, ...membersFull].sort(byYear);
  result.main = all.find(a => a.type === 'TV') || all[0];

  // Phase 4 : classer
  for (const anime of all) {
    if (anime.mal_id === result.main.mal_id) continue;
    result[TYPE_MAP[anime.type] || 'seasons'].push(anime);
  }

  // Phase 5 : spin-offs
  for (const id of [...spinoffIds].slice(0, MAX_SPINOFFS)) {
    try { const d = await jikanGet(`/anime/${id}/full`); if (d.data) result.spinOff.push(d.data); } catch {}
  }

  result.seasons = dedupe(result.seasons).sort(byYear).slice(0, MAX_PER_CAT);
  result.movies  = dedupe(result.movies).sort(byYear).slice(0, MAX_PER_CAT);
  result.ova     = dedupe(result.ova).sort(byYear).slice(0, MAX_PER_CAT);
  result.special = dedupe(result.special).sort(byYear).slice(0, MAX_PER_CAT);
  result.spinOff = dedupe(result.spinOff).sort(byYear).slice(0, MAX_SPINOFFS);

  return result;
}

/* ── Handler principal ───────────────────────────────────────────────── */
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id manquant' });

  const cacheRef = db.collection('franchise_cache').doc(String(id));

  // 1. Vérifie le cache Firestore
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      const cached = snap.data();
      const age    = Date.now() - (cached.cachedAt?.toMillis?.() || 0);
      if (age < CACHE_TTL) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached.franchise);
      }
    }
  } catch (e) {
    console.warn('Cache read error:', e.message);
  }

  // 2. Cache absent ou expiré → appelle Jikan
  try {
    const franchise = await buildFranchiseServer(id);

    // 3. Stocke dans Firestore
    await cacheRef.set({
      franchise,
      cachedAt: new Date(),
      animeId:  id,
    });

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(franchise);

  } catch (e) {
    console.error('Franchise build error:', e.message);
    return res.status(500).json({ error: 'Impossible de charger la franchise' });
  }
}
