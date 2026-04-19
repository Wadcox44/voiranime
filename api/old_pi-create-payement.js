export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, memo, metadata } = req.body;

    if (!amount || !memo) {
      return res.status(400).json({ error: "Missing amount or memo" });
    }

    if (Number(amount) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const response = await fetch("https://api.minepi.com/v2/payments", {
      method: "POST",
      headers: {
        Authorization: `Key ${process.env.PI_APP_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Number(amount),
        memo,
        metadata: metadata || {},
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        error: "Pi API error",
        details: data,
      });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
}
