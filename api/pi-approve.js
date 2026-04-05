/**
 * /api/pi-approve.js
 * Variable requise : PI_API_KEY
 */

const PI_API = 'https://api.minepi.com/v2';

async function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.PI_API_KEY;
  if (!apiKey) {
    console.error('[pi-approve] ❌ PI_API_KEY manquante');
    return res.status(500).json({ error: 'PI_API_KEY not set' });
  }

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { paymentId } = body;
  if (!paymentId) {
    console.error('[pi-approve] ❌ paymentId manquant');
    return res.status(400).json({ error: 'Missing paymentId' });
  }

  const url = `${PI_API}/payments/${paymentId}/approve`;
  console.log(`[pi-approve] POST ${url}`);
  console.log(`[pi-approve] Key prefix: ${apiKey.substring(0, 8)}...`);

  try {
    const piRes = await fetch(url, {
      method:  'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
    });

    const rawText = await piRes.text();
    console.log(`[pi-approve] Pi API status: ${piRes.status}`);
    console.log(`[pi-approve] Pi API response: ${rawText}`);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!piRes.ok) {
      return res.status(piRes.status).json({
        error:    'Pi API error',
        status:   piRes.status,
        details:  data,
      });
    }

    console.log(`[pi-approve] ✅ Approved: ${paymentId}`);
    return res.status(200).json({ success: true, payment: data });

  } catch (e) {
    console.error('[pi-approve] ❌ Fetch error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
