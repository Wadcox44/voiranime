const PI_API = 'https://api.minepi.com/v2';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.PI_APP_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Pi API key not configured' });
  }

  const { paymentId, txid } = req.body;

  if (!paymentId || !txid) {
    return res.status(400).json({ error: 'Missing paymentId or txid' });
  }

  try {
    const piRes = await fetch(`${PI_API}/payments/${paymentId}/complete`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ txid }),
    });

    const data = await piRes.json();

    if (!piRes.ok) {
      return res.status(piRes.status).json({
        error: data?.error || 'Pi completion failed'
      });
    }

    return res.status(200).json({
      success: true,
      payment: data
    });

  } catch (e) {
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
};
