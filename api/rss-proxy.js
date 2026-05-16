// api/rss-proxy.js — VoirAnime
// Proxy RSS → JSON, déployé sur Vercel
// Usage : /api/rss-proxy?url=https://...&count=50

const https = require('https');
const http  = require('http');

function fetchUrl(urlStr) {
  return new Promise((resolve, reject) => {
    const mod = urlStr.startsWith('https') ? https : http;
    const req = mod.get(urlStr, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VoirAnime/1.0; +https://voir-anime.vercel.app)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      timeout: 8000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function parseRSS(xml, count) {
  const items = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < count) {
    const raw = match[1];
    const get = (tag) => {
      const re = new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}(?:[^>]*)>([^<]*)<\\/${tag}>`, 'i');
      const m = re.exec(raw);
      return m ? (m[1] || m[2] || '').trim() : '';
    };
    const getAttr = (tag, attr) => {
      const re = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'i');
      const m = re.exec(raw);
      return m ? m[1] : '';
    };
    // Image : media:thumbnail, enclosure, ou img dans description
    let thumbnail = getAttr('media:thumbnail', 'url') || getAttr('media:content', 'url') || getAttr('enclosure', 'url');
    if (!thumbnail) {
      const desc = get('description') || get('content:encoded') || '';
      const imgM = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgM) thumbnail = imgM[1];
    }
    items.push({
      title:       get('title'),
      link:        get('link') || getAttr('guid', 'isPermaLink') || get('guid'),
      pubDate:     get('pubDate') || get('dc:date'),
      description: get('description'),
      thumbnail,
    });
  }
  return items;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, count = '30' } = req.query;
  if (!url) return res.status(400).json({ error: 'missing url param' });

  // Whitelist sécurité
  const allowed = [
    'myanimelist.net',
    'animenewsnetwork.com',
    'nautiljon.com',
    'otakuusamagazine.com',
    'crunchyroll.com',
  ];
  try {
    const host = new URL(url).hostname;
    if (!allowed.some(d => host.endsWith(d))) {
      return res.status(403).json({ error: 'domain not allowed' });
    }
  } catch (_) {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const xml   = await fetchUrl(url);
    const items = parseRSS(xml, Math.min(parseInt(count, 10) || 30, 100));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ status: 'ok', items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
