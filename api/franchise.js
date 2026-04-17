/**
 * api/franchise.js — Vercel Serverless Function
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const id = parseInt(req.query.id);
  if (!id) return res.status(400).json({ error: 'id manquant' });

  let admin, db;

  // Init Firebase Admin
  try {
    admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
      });
    }
    db = admin.firestore();
  } catch (e) {
    console.error('Firebase init error:', e.message);
    return res.status(500).json({ error: 'Firebase init failed: ' + e.message });
  }

  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const JIKAN     = 'https://api.jikan.moe/v4';
  const DELAY     = 420;
  const sleep     = ms => new Promise(r => setTimeout(r, ms));

  const TYPE_MAP          = { TV:'seasons', Movie:'movies', OVA:'ova', Special:'special', ONA:'seasons' };
  const MAIN_RELATIONS    = new Set(['prequel','sequel','side_story','alternative_version','full_story','summary']);
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
    const res = await fetch(`${JIKAN}${path}`);
    if (res.status === 429) { await sleep(2000); return jikanGet(path); }
    if (!res.ok) throw new Error(`Jikan ${res.status} on ${path}`);
    return res.json();
  }

  async function buildFranchise(animeId) {
    const result   = { main: null, seasons: [], movies: [], ova: [], special: [], spinOff: [] };
    const visited  = new Set([animeId]);
    const members  = new Set();
    const spinoffs = new Set();
    const queue    = [{ id: animeId, depth: 0 }];

    while (queue.length > 0) {
      const { id, depth } = queue.shift();
      if (depth > 2) continue;
      let rels = [];
      try { rels = (await jikanGet(`/anime/${id}/relations`)).data || []; } catch {}
      for (const rel of rels) {
        for (const e of rel.entry || []) {
          if (e.type !== 'anime' || visited.has(e.mal_id)) continue;
          visited.add(e.mal_id);
          if (SPINOFF_RELATIONS.has(rel.relation)) spinoffs.add(e.mal_id);
          else if (MAIN_RELATIONS.has(rel.relation)) {
            members.add(e.mal_id);
            if (depth < 2) queue.push({ id: e.mal_id, depth: depth + 1 });
          }
        }
      }
    }

    let root = null;
    try { root = (await jikanGet(`/anime/${animeId}/full`)).data; } catch {}
    if (!root) return result;

    const membersFull = [];
    for (const mid of [...members].slice(0, MAX_PER_CAT * 3)) {
      try { const d = (await jikanGet(`/anime/${mid}/full`)).data; if (d) membersFull.push(d); } catch {}
    }

    const all = [root, ...membersFull].sort(byYear);
    result.main = all.find(a => a.type === 'TV') || all[0];

    for (const anime of all) {
      if (anime.mal_id === result.main.mal_id) continue;
      result[TYPE_MAP[anime.type] || 'seasons'].push(anime);
    }

    for (const sid of [...spinoffs].slice(0, MAX_SPINOFFS)) {
      try { const d = (await jikanGet(`/anime/${sid}/full`)).data; if (d) result.spinOff.push(d); } catch {}
    }

    result.seasons = dedupe(result.seasons).sort(byYear).slice(0, MAX_PER_CAT);
    result.movies  = dedupe(result.movies).sort(byYear).slice(0, MAX_PER_CAT);
    result.ova     = dedupe(result.ova).sort(byYear).slice(0, MAX_PER_CAT);
    result.special = dedupe(result.special).sort(byYear).slice(0, MAX_PER_CAT);
    result.spinOff = dedupe(result.spinOff).sort(byYear).slice(0, MAX_SPINOFFS);

    return result;
  }

  // Vérifie cache
  try {
    const snap = await db.collection('franchise_cache').doc(String(id)).get();
    if (snap.exists) {
      const { franchise, cachedAt } = snap.data();
      if (Date.now() - cachedAt.toMillis() < CACHE_TTL) {
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(franchise);
      }
    }
  } catch (e) {
    console.warn('Cache read error:', e.message);
  }

  // Build + cache
  try {
    const franchise = await buildFranchise(id);
    try {
      await db.collection('franchise_cache').doc(String(id)).set({
        franchise, cachedAt: new Date(), animeId: id,
      });
    } catch (e) {
      console.warn('Cache write error:', e.message);
    }
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(franchise);
  } catch (e) {
    console.error('Build error:', e.message);
    return res.status(500).json({ error: e.message });
  }
};
