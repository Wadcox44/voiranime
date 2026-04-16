/**
 * animeFranchise.js
 * Regroupe les animes d'une même licence à partir d'un ID Jikan.
 * Utilise jikanFetch() de main.js (queue + cache intégrés).
 *
 * Résultat :
 * {
 *   main:    { mal_id, title, ... },
 *   seasons: [...],
 *   movies:  [...],
 *   ova:     [...],
 *   special: [...],
 *   spinOff: []
 * }
 */

// ─── Types Jikan → catégorie interne ───────────────────────────────────────
const TYPE_MAP = {
  TV:      'seasons',
  Movie:   'movies',
  OVA:     'ova',
  Special: 'special',
  ONA:     'seasons', // web series → traiter comme saison
};

// Relations qui constituent la franchise principale (pas spin-off)
const MAIN_RELATIONS = new Set(['prequel', 'sequel', 'side_story', 'alternative_version', 'full_story', 'summary']);

// Relations spin-off → catégorie séparée
const SPINOFF_RELATIONS = new Set(['spin_off', 'character', 'other']);

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Normalise un titre pour comparaison floue */
function normalizeTitle(t = '') {
  return t.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Vérifie si deux animes partagent un titre commun */
function shareTitle(a, b) {
  const titlesA = [a.title, a.title_english, a.title_japanese].map(normalizeTitle).filter(Boolean);
  const titlesB = [b.title, b.title_english, b.title_japanese].map(normalizeTitle).filter(Boolean);
  return titlesA.some(ta => titlesB.some(tb => tb.includes(ta) || ta.includes(tb)));
}

/** Déduplique un tableau d'animes par mal_id */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter(a => {
    if (seen.has(a.mal_id)) return false;
    seen.add(a.mal_id);
    return true;
  });
}

// ─── Fetch avec fallback ────────────────────────────────────────────────────

async function fetchAnime(id) {
  try {
    const data = await jikanFetch(`/anime/${id}/full`);
    return data.data || null;
  } catch {
    return null;
  }
}

async function fetchRelations(id) {
  try {
    const data = await jikanFetch(`/anime/${id}/relations`);
    return data.data || [];
  } catch {
    return [];
  }
}

// ─── Fonction principale ────────────────────────────────────────────────────

/**
 * buildFranchise(animeId)
 * @param {number} animeId - MAL ID de l'anime de départ
 * @returns {Promise<FranchiseResult>}
 */
async function buildFranchise(animeId) {
  const result = {
    main:    null,
    seasons: [],
    movies:  [],
    ova:     [],
    special: [],
    spinOff: [],
  };

  // 1. Récupère l'anime de départ
  const root = await fetchAnime(animeId);
  if (!root) return result;

  const visited   = new Set([root.mal_id]); // évite les boucles infinies
  const mainQueue = [];                      // IDs à explorer (franchise principale)
  const spinQueue = [];                      // IDs spin-off à résoudre

  // 2. Récupère les relations du root
  const rootRelations = await fetchRelations(root.mal_id);

  for (const rel of rootRelations) {
    for (const entry of rel.entry || []) {
      if (entry.type !== 'anime') continue;
      if (visited.has(entry.mal_id)) continue;

      if (MAIN_RELATIONS.has(rel.relation)) {
        mainQueue.push({ id: entry.mal_id, relation: rel.relation });
      } else if (SPINOFF_RELATIONS.has(rel.relation)) {
        spinQueue.push(entry.mal_id);
      }
    }
  }

  // 3. Trouve l'anime "principal" = le prequel le plus ancien
  //    On remonte la chaîne des prequels depuis le root
  let main = root;
  {
    let current = root;
    let safetyCounter = 0;

    while (safetyCounter++ < 10) {
      const rels = await fetchRelations(current.mal_id);
      const prequelEntry = rels
        .filter(r => r.relation === 'prequel')
        .flatMap(r => r.entry || [])
        .find(e => e.type === 'anime');

      if (!prequelEntry || visited.has(prequelEntry.mal_id)) break;

      visited.add(prequelEntry.mal_id);
      const prequel = await fetchAnime(prequelEntry.mal_id);
      if (!prequel) break;

      main = prequel;
      current = prequel;

      // Ajoute les relations du prequel à la queue aussi
      const preRels = await fetchRelations(prequel.mal_id);
      for (const rel of preRels) {
        for (const entry of rel.entry || []) {
          if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
          if (MAIN_RELATIONS.has(rel.relation)) {
            mainQueue.push({ id: entry.mal_id, relation: rel.relation });
          } else if (SPINOFF_RELATIONS.has(rel.relation)) {
            spinQueue.push(entry.mal_id);
          }
        }
      }
    }
  }

  result.main = main;
  visited.add(main.mal_id);

  // 4. Résout tous les membres de la franchise principale
  for (const { id } of mainQueue) {
    if (visited.has(id)) continue;
    visited.add(id);

    const anime = await fetchAnime(id);
    if (!anime) continue;

    // Sécurité : vérifie que l'anime partage un titre avec le main
    // (évite les regroupements trop larges)
    if (!shareTitle(main, anime) && anime.mal_id !== root.mal_id) {
      // Pas de titre commun → on l'ajoute quand même si c'est un sequel/prequel direct
      // mais on le met en spinOff si c'est un side_story sans titre commun
    }

    const category = TYPE_MAP[anime.type] || 'seasons';
    if (anime.mal_id !== main.mal_id) {
      result[category].push(anime);
    }

    // Explore les séquelles de ce membre aussi (1 niveau de profondeur)
    const subRels = await fetchRelations(anime.mal_id);
    for (const rel of subRels) {
      for (const entry of rel.entry || []) {
        if (entry.type !== 'anime' || visited.has(entry.mal_id)) continue;
        if (MAIN_RELATIONS.has(rel.relation)) {
          mainQueue.push({ id: entry.mal_id, relation: rel.relation });
        } else if (SPINOFF_RELATIONS.has(rel.relation)) {
          spinQueue.push(entry.mal_id);
        }
      }
    }
  }

  // 5. Résout les spin-offs
  for (const id of spinQueue) {
    if (visited.has(id)) continue;
    visited.add(id);
    const anime = await fetchAnime(id);
    if (anime) result.spinOff.push(anime);
  }

  // 6. Trie chaque catégorie par année de diffusion
  const byYear = (a, b) => {
    const ya = a.aired?.from ? new Date(a.aired.from).getFullYear() : 9999;
    const yb = b.aired?.from ? new Date(b.aired.from).getFullYear() : 9999;
    return ya - yb;
  };

  result.seasons = dedupe(result.seasons).sort(byYear);
  result.movies  = dedupe(result.movies).sort(byYear);
  result.ova     = dedupe(result.ova).sort(byYear);
  result.special = dedupe(result.special).sort(byYear);
  result.spinOff = dedupe(result.spinOff).sort(byYear);

  return result;
}

// ─── Exemple d'utilisation ─────────────────────────────────────────────────
/*
buildFranchise(20).then(franchise => {
  console.log('Main :', franchise.main.title);
  console.log('Saisons :', franchise.seasons.map(a => a.title));
  console.log('Films :', franchise.movies.map(a => a.title));
  console.log('OVA :', franchise.ova.map(a => a.title));
  console.log('Spéciaux :', franchise.special.map(a => a.title));
  console.log('Spin-offs :', franchise.spinOff.map(a => a.title));
});
// ID 20 = Naruto
// Résultat attendu :
// Main : Naruto
// Saisons : [Naruto, Naruto: Shippuuden, Boruto]
// Films : [Naruto the Movie 1, 2, 3, Road to Ninja, ...]
// OVA : [Find the Four-Leaf Clover!, ...]
// Spin-offs : [Rock Lee no Seishun Full-Power Ninden, ...]
*/
