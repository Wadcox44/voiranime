/**
 * animeFranchise.js — Module ES
 * Appelle /api/franchise (cache Firestore) au lieu de Jikan directement.
 * → Pas de rate limit, pas de 429, scalable à 10 000 users.
 */

export async function buildFranchise(animeId) {
  const res = await fetch(`/api/franchise?id=${animeId}`);

  if (!res.ok) {
    console.warn(`[Franchise] API error ${res.status}`);
    return { main: null, seasons: [], movies: [], ova: [], special: [], spinOff: [] };
  }

  return res.json();
}
