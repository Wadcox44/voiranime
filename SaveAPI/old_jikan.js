const CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000;

async function fetchJikan(path, retries = 3) {
  const url = `https://api.jikan.moe/v4/${path}`;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
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
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  if (!/^[\w\/\-\?\=\&\.]+$/.test(path)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const cached = CACHE.get(path);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.json(cached.data);
  }

  try {
    const data = await fetchJikan(path);
    CACHE.set(path, { data, ts: Date.now() });
    if (CACHE.size > 500) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
      CACHE.delete(oldest);
    }
    res.setHeader('X-Cache', 'MISS');
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
}
