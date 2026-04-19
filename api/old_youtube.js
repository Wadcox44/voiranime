/**
 * /api/youtube.js — Proxy YouTube Data API v3
 * 
 * Cache la clé YouTube côté serveur.
 * Le frontend appelle /api/youtube?q=titre+anime+trailer
 * au lieu d'appeler Google directement.
 * 
 * Variables d'environnement requises :
 *   YOUTUBE_API_KEY — clé YouTube Data API v3
 */

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';

// Suffixes de recherche par priorité
const SUFFIXES = [
  'official trailer',
  'trailer',
  'opening',
  'ending',
  'teaser',
  'official clip',
];

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'YouTube API key not configured' });
  }

  const { title } = req.query;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Missing title parameter' });
  }

  // Cache HTTP : 1h côté Vercel CDN
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  // Tente chaque suffix dans l'ordre
  for (const suffix of SUFFIXES) {
    try {
      const q   = encodeURIComponent(`${title.trim()} anime ${suffix}`);
      const url = `${YT_SEARCH}?part=snippet&q=${q}&type=video&maxResults=1&key=${apiKey}`;

      const ytRes  = await fetch(url);

      if (ytRes.status === 403) {
        return res.status(429).json({ error: 'YouTube quota exceeded' });
      }
      if (!ytRes.ok) continue;

      const data  = await ytRes.json();
      const video = data.items?.[0];

      if (video?.id?.videoId) {
        return res.status(200).json({
          videoId:  video.id.videoId,
          title:    video.snippet?.title,
          suffix,
        });
      }
    } catch (e) {
      console.error(`[YouTube API] Error for suffix "${suffix}":`, e.message);
    }
  }

  // Aucun résultat
  return res.status(404).json({ error: 'No video found' });
}
