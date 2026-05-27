// api/rss-proxy.js — VoirAnime (ESM)
import https from 'https';
import http from 'http';
import { URL } from 'url';

const ALLOWED_DOMAINS = [
  'myanimelist.net',
  'animenewsnetwork.com',
  'nautiljon.com',
  'otakuusamagazine.com',
  'crunchyroll.com',
  'animationmagazine.net',
  'animeplanet.com',
];

function fetchUrl(urlStr, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('too many redirects'));
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(urlStr); } catch(e) { return reject(e); }
    const mod = parsed.protocol === 'https:' ? https : http;
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'fr,en;q=0.9',
      },
      timeout: 9000,
    };
    const req = mod.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : parsed.origin + res.headers.location;
        return fetchUrl(next, redirects + 1).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function getText(raw, tag) {
  const mC = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i').exec(raw);
  if (mC) return mC[1].trim();
  const mP = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i').exec(raw);
  return mP ? mP[1].trim() : '';
}

function getAttr(raw, tag, attr) {
  const m = new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["']`, 'i').exec(raw);
  return m ? m[1] : '';
}

function extractImage(raw) {
  const thumb = getAttr(raw, 'media:thumbnail', 'url')
    || getAttr(raw, 'media:content', 'url')
    || getAttr(raw, 'enclosure', 'url');
  if (thumb) return thumb;
  const desc = getText(raw, 'description') || getText(raw, 'content:encoded') || '';
  const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function parseRSS(xml, count) {
  const items = [];
  const re = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < count) {
    const raw = m[1];
    items.push({
      title:       getText(raw, 'title'),
      link:        getText(raw, 'link') || getText(raw, 'guid'),
      pubDate:     getText(raw, 'pubDate') || getText(raw, 'dc:date'),
      description: getText(raw, 'description'),
      thumbnail:   extractImage(raw),
    });
  }
  return items;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url, count = '30' } = req.query || {};
  if (!url) return res.status(400).json({ error: 'missing url param' });

  let hostname;
  try { hostname = new URL(url).hostname; }
  catch (_) { return res.status(400).json({ error: 'invalid url' }); }

  if (!ALLOWED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
    return res.status(403).json({ error: 'domain not allowed: ' + hostname });
  }

  const n = Math.min(Math.max(parseInt(count, 10) || 30, 1), 100);

  try {
    const xml = await fetchUrl(url);
    const items = parseRSS(xml, n);
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ status: 'ok', items, count: items.length });
  } catch (err) {
    console.error('[rss-proxy]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
