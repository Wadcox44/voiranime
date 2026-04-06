/**
 * /api/pi-approve.js
 * Reçoit { paymentId } depuis le frontend
 * Variable requise : PI_APP_API_KEY
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
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET : test de config
  if (req.method === 'GET') {
    const apiKey = process.env.PI_APP_API_KEY;
    return res.status(200).json({
      configured: !!apiKey,
      prefix: apiKey ? apiKey.substring(0, 6) + '...' : 'MISSING'
    });
  }

  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const PI_API_KEY = process.env.PI_APP_API_KEY;
  if (!PI_API_KEY) {
    console.error('[pi-approve] ❌ PI_API_KEY manquante');
    return res.status(500).json({ error: 'PI_APP_API_KEY not set' });
  }

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

  // Accepte { paymentId } ou { payment: { identifier } }
  const paymentId = body.paymentId || body.payment?.identifier;
  if (!paymentId) {
    return res.status(400).json({ error: 'Missing paymentId' });
  }

  const url = `${PI_API}/payments/${paymentId}/approve`;
  console.log(`[pi-approve] POST ${url}`);

  try {
    const piRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_APP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const rawText = await piRes.text();
    console.log(`[pi-approve] Status: ${piRes.status} | Response: ${rawText}`);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!piRes.ok) {
      return res.status(piRes.status).json({ error: 'Pi API error', status: piRes.status, details: data });
    }

    console.log(`[pi-approve] ✅ Approved: ${paymentId}`);
    return res.status(200).json({ success: true, payment: data });

  } catch (e) {
    console.error('[pi-approve] ❌', e.message);
    return res.status(500).json({ error: e.message });
  }
}
