/**
 * /api/pi-complete.js
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
    console.error('[pi-complete] ❌ PI_API_KEY manquante');
    return res.status(500).json({ error: 'PI_API_KEY not set' });
  }

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

  const { paymentId, txid } = body;
  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'Missing paymentId or txid' });
  }

  const url = `${PI_API}/payments/${paymentId}/complete`;
  const authHeader = `key ${apiKey}`;

  console.log(`[pi-complete] POST ${url}`);

  try {
    const piRes = await fetch(url, {
      method:  'POST',
      headers: {
        'authorization': authHeader,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ txid }),
    });

    const rawText = await piRes.text();
    console.log(`[pi-complete] Status: ${piRes.status} | Response: ${rawText}`);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!piRes.ok) {
      return res.status(piRes.status).json({
        error:   'Pi API error',
        status:  piRes.status,
        details: data,
      });
    }

    console.log(`[pi-complete] ✅ Completed: ${paymentId}`);
    return res.status(200).json({ success: true, payment: data });

  } catch (e) {
    console.error('[pi-complete] ❌ Network error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
