/**
 * /api/pi-complete.js
 * Reçoit { paymentId, txid } ou { payment } depuis le frontend
 * Variable requise : PI_API_KEY
 */

const PI_API = 'https://api.testnet.minepi.com/v2';

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
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  const PI_API_KEY = process.env.PI_API_KEY;
  if (!PI_API_KEY) {
    console.error('[pi-complete] ❌ PI_API_KEY manquante');
    return res.status(500).json({ error: 'PI_API_KEY not set' });
  }

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'Invalid JSON body' }); }

  // Accepte { paymentId, txid } ou { payment: { identifier, transaction: { txid } } }
  const paymentId = body.paymentId || body.payment?.identifier;
  const txid      = body.txid      || body.payment?.transaction?.txid;

  if (!paymentId) {
    return res.status(400).json({ error: 'Missing paymentId' });
  }

  let url, fetchOptions;

  if (txid) {
    // Complétion normale
    url = `${PI_API}/payments/${paymentId}/complete`;
    fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Key ${PI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    };
    console.log(`[pi-complete] POST complete ${paymentId}`);
  } else {
    // Pas de txid = annulation (paiement incomplet sans transaction)
    url = `${PI_API}/payments/${paymentId}/cancel`;
    fetchOptions = {
      method: 'POST',
      headers: { 'Authorization': `Key ${PI_API_KEY}` },
    };
    console.log(`[pi-complete] POST cancel ${paymentId} (no txid)`);
  }

  try {
    const piRes = await fetch(url, fetchOptions);
    const rawText = await piRes.text();
    console.log(`[pi-complete] Status: ${piRes.status} | Response: ${rawText}`);

    let data;
    try { data = JSON.parse(rawText); } catch { data = { raw: rawText }; }

    if (!piRes.ok) {
      return res.status(piRes.status).json({ error: 'Pi API error', status: piRes.status, details: data });
    }

    console.log(`[pi-complete] ✅ Done: ${paymentId}`);
    return res.status(200).json({ success: true, payment: data });

  } catch (e) {
    console.error('[pi-complete] ❌', e.message);
    return res.status(500).json({ error: e.message });
  }
}
