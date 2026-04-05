/**
 * /api/pi-complete.js — Complétion paiement Pi Network
 *
 * Appelé par le frontend via onReadyForServerCompletion.
 * Variable d'environnement requise : PI_API_KEY
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  // Variable Vercel PI_API_KEY
  const apiKey = process.env.PI_API_KEY;
  if (!apiKey) {
    console.error('[pi-complete] PI_API_KEY non définie dans les variables Vercel');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Parse body
  let body;
  try { body = await parseBody(req); }
  catch { return res.status(400).json({ error: 'Invalid request body' }); }

  const { paymentId, txid } = body;
  if (!paymentId || typeof paymentId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid paymentId' });
  }
  if (!txid || typeof txid !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid txid' });
  }

  console.log(`[pi-complete] Completing payment: ${paymentId} | txid: ${txid}`);

  try {
    const piRes = await fetch(`${PI_API}/payments/${paymentId}/complete`, {
      method:  'POST',
      headers: {
        Authorization:  `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });

    let data;
    try { data = await piRes.json(); } catch { data = {}; }

    if (!piRes.ok) {
      console.error(`[pi-complete] Pi API error ${piRes.status}:`, data);
      return res.status(piRes.status).json({
        error:   data?.error_message || data?.error || 'Completion failed',
        details: data,
      });
    }

    console.log(`[pi-complete] ✅ Completed: ${paymentId} | txid: ${txid}`);
    return res.status(200).json({ success: true, payment: data });

  } catch (e) {
    console.error('[pi-complete] Network error:', e.message);
    return res.status(500).json({ error: 'Could not reach Pi API' });
  }
}
