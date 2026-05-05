// api/jikan.js — proxy vers l'API Jikan v4 (MyAnimeList) avec cache mémoire et retry
//
// Usage côté client :
//   fetch('/api/jikan?path=' + encodeURIComponent('/anime/1'))
//   fetch('/api/jikan?path=' + encodeURIComponent('/seasons/now'))
//
// Le path peut commencer par '/' (recommandé) ou non, on normalise dans tous les cas.

const CACHE = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MAX_CACHE_ENTRIES = 500;

async function fetchJikan(path, retries = 3) {
  // Normaliser : retirer le slash initial s'il existe
  const cleanPath = path.replace(/^\/+/, '');
  const url = `https://api.jikan.moe/v4/${cleanPath}`;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        // Rate-limit Jikan : attente exponentielle
        await new Promise(r => setTimeout(r, (i + 1) * 1500));
        continue;
      }
      if (!res.ok) throw new Error(`Jikan ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export default async function handler(req, res) {
  // CORS — appliqué à toutes les réponses (incluant les hits cache)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  // Whitelist permissive : lettres, chiffres, /, ?, =, &, -, _, ., %, virgule, deux-points
  if (!/^[\w\/\-\?\=\&\.\,\:\%]+$/.test(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  // Cache hit
  const cached = CACHE.get(path);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const data = await fetchJikan(path);
    CACHE.set(path, { data, ts: Date.now() });

    // Éviction LRU simple
    if (CACHE.size > MAX_CACHE_ENTRIES) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
      CACHE.delete(oldest);
    }

    res.setHeader('X-Cache', 'MISS');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message || 'Jikan upstream error' });
  }
}
