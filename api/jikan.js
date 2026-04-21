const CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 heure

export default async function handler(req, res) {
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Missing path' });

  // On nettoie pour éviter une URL du type: https://api.jikan.moe/v4//anime/...
  const cleanPath = path.startsWith('/') ? path.substring(1) : path;

  if (!/^[\w\/\-\?\=\&\.]+$/.test(cleanPath)) {
    return res.status(400).json({ error: 'Invalid path' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const cached = CACHE.get(cleanPath);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cached.data);
  }

  try {
    const response = await fetch(`https://api.jikan.moe/v4/${cleanPath}`);
    
    // Relais miroir instantané de la saturation — Le frontend s'occupera d'attendre
    if (response.status === 429) {
       return res.status(429).json({ error: "Too Many Requests" });
    }

    if (!response.ok) {
       throw new Error(`Jikan API HTTP ${response.status}`);
    }

    const data = await response.json();
    
    // Mise en cache
    CACHE.set(cleanPath, { data, ts: Date.now() });
    if (CACHE.size > 500) {
      const oldest = [...CACHE.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
      CACHE.delete(oldest);
    }
    
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(data);

  } catch (e) {
    // Si l'API Jikan est totalement injoignable (ex: réseau coupé)
    return res.status(502).json({ error: e.message });
  }
}
