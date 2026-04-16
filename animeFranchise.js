/**
 * animeFranchise.js — Module ES
 * Regroupe les animes d'une même licence à partir d'un ID Jikan.
 * Reçoit jikanFetch en paramètre (injecté depuis anime.js).
 */

const TYPE_MAP = {
  TV:      'seasons',
  Movie:   'movies',
  OVA:     'ova',
  Special: 'special',
  ONA:     'seasons',
};

const MAIN_RELATIONS   = new Set(['prequel', 'sequel', 'side_story', 'alternative_version', 'full_story', 'summary']);
const SPINOFF_RELATIONS = new Set(['spin_off', 'character', 'other']);

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(a => { if (seen.has(a.mal_id)) return false; seen.add(a.mal_id); return true; });
}

const byYear = (a, b) => {
  const ya = a.aired?.from ? new Date(a.aired.from).getFullYear() : 9999;
  const yb = b.aired?.from ? new Date(b.aired.from).getFullYear() : 9999;
  return ya - yb;
};

export async function buildFranchise(animeId, jikanFetch) {
  const result = { main: null, seasons: [], movies: [], ova: [], special: [], spinOff: [] };

  const fetchAnime = async id => {
    try { const d = await jikanFetch(`/anime/${id}/full`); return d.data || null; } catch { return null; }
  };
  const fetchRelations = async id => {
    try { const d = await jikanFetch(`/anime/${id}/relations`); return d.data || []; } catch { return []; }
  };

  const root = await fetchAnime(animeId);
  if (!root) return result;

  const visited   = new Set([root.mal_id]);
  const mainQueue = [];
  const spinQueue = [];

  const collectRelations = (rels) => {
    for (const rel of rels) {
      for (const entry of rel.entry || []) {
        if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
        if (MAIN_RELATIONS.has(rel.relation))    mainQueue.push(entry.mal_id);
        else if (SPINOFF_RELATIONS.has(rel.relation)) spinQueue.push(entry.mal_id);
      }
    }
  };

  // Remonte jusqu'au prequel le plus ancien → anime principal
  let main = root;
  let current = root;
  collectRelations(await fetchRelations(current.mal_id));

  for (let i = 0; i < 10; i++) {
    const rels = await fetchRelations(current.mal_id);
    collectRelations(rels);
    const prequelId = rels
      .filter(r => r.relation === 'prequel')
      .flatMap(r => r.entry || [])
      .find(e => e.type === 'anime' && !visited.has(e.mal_id))?.mal_id;

    if (!prequelId) break;
    visited.add(prequelId);
    const prequel = await fetchAnime(prequelId);
    if (!prequel) break;
    main = prequel;
    current = prequel;
  }

  result.main = main;
  visited.add(main.mal_id);

  // Résout la franchise principale
  const toProcess = [...mainQueue];
  while (toProcess.length > 0) {
    const id = toProcess.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    const anime = await fetchAnime(id);
    if (!anime) continue;

    if (anime.mal_id !== main.mal_id) {
      const cat = TYPE_MAP[anime.type] || 'seasons';
      result[cat].push(anime);
    }

    const subRels = await fetchRelations(anime.mal_id);
    for (const rel of subRels) {
      for (const entry of rel.entry || []) {
        if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
        if (MAIN_RELATIONS.has(rel.relation))         toProcess.push(entry.mal_id);
        else if (SPINOFF_RELATIONS.has(rel.relation)) spinQueue.push(entry.mal_id);
      }
    }
  }

  // Résout les spin-offs
  for (const id of spinQueue) {
    if (visited.has(id)) continue;
    visited.add(id);
    const anime = await fetchAnime(id);
    if (anime) result.spinOff.push(anime);
  }

  result.seasons = dedupe(result.seasons).sort(byYear);
  result.movies  = dedupe(result.movies).sort(byYear);
  result.ova     = dedupe(result.ova).sort(byYear);
  result.special = dedupe(result.special).sort(byYear);
  result.spinOff = dedupe(result.spinOff).sort(byYear);

  return result;
}
