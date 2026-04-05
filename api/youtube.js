export default async function handler(req, res) {
  const title = req.query.title;

  const API_KEY = process.env.YT_API_KEY;

  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(title + " anime trailer")}&type=video&maxResults=1&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  const videoId = data.items?.[0]?.id?.videoId || null;

  res.status(200).json({ videoId });
}
