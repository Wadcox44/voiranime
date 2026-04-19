/**
 * api/franchise.js — Vercel Serverless Function (ESM)
 */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db        = getFirestore();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const JIKAN     = 'https://api.jikan.moe/v4';
const DELAY     = 450;
const sleep     = ms => new Promise(r => setTimeout(r, ms));

const TYPE_MAP          = { TV:'seasons', Movie:'movies', OVA:'ova', Special:'special', ONA:'seasons' };
const MAIN_RELATIONS    = new Set(['prequel','sequel','side_story','alternative_version','full_story','summary','other']);
const SPINOFF_RELATIONS = new Set(['spin_off','character']);
const MAX_PER_CAT = 8, MAX_SPINOFFS = 5;

const byYear = (a, b) => {
  const ya = a.aired?.from ? new Date(a.aired.from).getFullYear() : 9999;
  const yb = b.aired?.from ? new Date(b.aired.from).getFullYear() : 9999;
  return ya - yb;
};

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(a => { if (seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true; });
}

async function jikanGet(path) {
  await sleep(DELAY);
  const r = await fetch(`${JIKAN}${path}`);
  if (r.status === 429) { await sleep(2500); return jikanGet(path); }
  if (!r.ok) throw new Error(`Jikan ${r.status} ${path}`);
  return r.json();
}

async function buildFranchise(rootId) {
  const result   = { main: null, seasons: [], movies: [], ova: [], special: [], spinOff: [] };
  const visited  = new Set([rootId]);
  const toFetch  = [rootId];
  const spinoffs = new Set();

  const rootData = await jikanGet(`/anime/${rootId}/full`);
  const root     = rootData.data;
  if (!root) return result;

  for (const rel of root.relations || []) {
    const relKey = rel.relation.toLowerCase().replace(/ /g, '_');
    for (const entry of rel.entry || []) {
      if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
      visited.add(entry.mal_id);
      if (SPINOFF_RELATIONS.has(relKey)) spinoffs.add(entry.mal_id);
      else toFetch.push(entry.mal_id);
    }
  }

  const allAnimes = [root];
  for (const mid of toFetch.slice(1, MAX_PER_CAT * 3 + 1)) {
    try {
      const d = await jikanGet(`/anime/${mid}/full`);
      if (d.data) {
        allAnimes.push(d.data);
        for (const rel of d.data.relations || []) {
          const relKey = rel.relation.toLowerCase().replace(/ /g, '_');
          for (const entry of rel.entry || []) {
            if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
            visited.add(entry.mal_id);
            if (['prequel','sequel'].includes(relKey)) toFetch.push(entry.mal_id);
          }
        }
      }
    } catch {}
  }

  allAnimes.sort(byYear);
  result.main = allAnimes.find(a => a.type === 'TV') || allAnimes[0];

  for (const anime of allAnimes) {
    if (anime.mal_id === result.main.mal_id) continue;
    result[TYPE_MAP[anime.type] || 'seasons'].push(anime);
  }

  for (const sid of [...spinoffs].slice(0, MAX_SPINOFFS)) {
    try { const d = await jikanGet(`/anime/${sid}/full`); if (d.data) result.spinOff.push(d.data); } catch {}
  }

  result.seasons = dedupe(result.seasons).sort(byYear).slice(0, MAX_PER_CAT);
  result.movies  = dedupe(result.movies).sort(byYear).slice(0, MAX_PER_CAT);
  result.ova     = dedupe(result.ova).sort(byYear).slice(0, MAX_PER_CAT);
  result.special = dedupe(result.special).sort(byYear).slice(0, MAX_PER_CAT);
  result.spinOff = dedupe(result.spinOff).sort(byYear).slice(0, MAX_SPINOFFS);

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id manquant' });

  try {
    const snap = await db.collection('franchise_cache').doc(String(id)).get();
    if (snap.exists) {
      const { franchise, cachedAt } = snap.data();
      if (Date.now() - cachedAt.toMillis() < CACHE_TTL) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(franchise);
      }
    }
  } catch (e) { console.warn('Cache read:', e.message); }

  try {
    const franchise = await buildFranchise(id);
    try {
      await db.collection('franchise_cache').doc(String(id)).set({
        franchise, cachedAt: new Date(), animeId: id,
      });
    } catch (e) { console.warn('Cache write:', e.message); }
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(franchise);
  } catch (e) {
    console.error('Build error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
