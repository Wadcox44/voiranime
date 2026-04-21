const CACHE = new Map();
const CACHE_TTL = 60 * 60 * 1000;

export default async function handler(req, res) {
  const path = req.query.path;
  if (!path) return res.status(400).json({ error: 'Missing path' });

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
    
    // On extrait la vraie erreur de Jikan sans jamais faire de "throw" qui crashe en 502 !
    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { error: "Unparseable response from Jikan" };
    }
    
    if (response.ok) {
      CACHE.set(cleanPath, { data, ts: Date.now() });
      if (CACHE.size > 500) CACHE.delete(CACHE.keys().next().value);
    }
    
    res.setHeader('X-Cache', 'MISS');
    // On relaie le vrai statut HTTP (200, 429, 403...) direct au Frontend
    return res.status(response.status).json(data);

  } catch (e) {
    // Si Jikan est VRAIMENT injoignable (DNS down...) on renvoie 500 et non 502
    return res.status(500).json({ error: e.message });
  }
}
