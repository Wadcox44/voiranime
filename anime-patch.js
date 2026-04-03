/* ═══════════════════════════════════════════════════════
   anime-patch.js
   ► Code à REMPLACER / AJOUTER dans anime.js
   ► Intègre trackView() et trackClick() Firebase
   ═══════════════════════════════════════════════════════

   INSTRUCTIONS :
   1. Ouvre anime.html
   2. REMPLACE <script src="anime.js"></script>
      PAR :
        <script type="module" src="anime.js"></script>

   3. En haut de anime.js, AJOUTE cette ligne :
        import { trackView, trackClick } from './firebase.js';

   4. Dans la fonction init() de anime.js,
      après avoir récupéré l'animeId depuis l'URL,
      AJOUTE :
        trackView(animeId);  // ← une seule ligne

   5. Dans renderDetail(anime), REMPLACE les boutons streaming
      par le code ci-dessous (copie les blocs marqués ▼)
   ═══════════════════════════════════════════════════════ */


/* ─────────────────────────────────────────────────────
   ▼ BLOC 1 — Import à ajouter tout en haut de anime.js
─────────────────────────────────────────────────────── */

// import { trackView, trackClick } from './firebase.js';


/* ─────────────────────────────────────────────────────
   ▼ BLOC 2 — Dans init(), après avoir lu l'animeId
   Remplace l'appel actuel à jikanFetch par ceci :
─────────────────────────────────────────────────────── */

/*
async function init() {
  initNavbar();
  initCarouselButtons();

  const params  = new URLSearchParams(window.location.search);
  const animeId = params.get('id');

  if (!animeId) { ... } // ← garde ton code existant

  // ★ NOUVEAU — tracking vue Firebase
  trackView(animeId);

  try {
    const data = await jikanFetch(`/anime/${animeId}/full`);
    renderDetail(data.data);
    hidePageLoader();
    loadRecommendations(animeId);
  } catch (e) { ... }
}
*/


/* ─────────────────────────────────────────────────────
   ▼ BLOC 3 — Dans renderDetail(anime)
   Remplace les lignes qui set watchCrunchyBtn.href et
   watchNetflixBtn.href par ces listeners :
─────────────────────────────────────────────────────── */

/*
// Remplace :
//   el('watchCrunchyBtn').href = `https://...`;
//   el('watchNetflixBtn').href = `https://...`;
//   el('streamCrunchyroll').href = `https://...`;
//   el('streamNetflix').href = `https://...`;
//   el('streamADN').href = `https://...`;
//
// PAR :

const titleEnc = encodeURIComponent(title);
const urls = {
  crunchyroll: `https://www.crunchyroll.com/search?q=${titleEnc}`,
  netflix:     `https://www.netflix.com/search?q=${titleEnc}`,
  adn:         `https://animedigitalnetwork.fr/video/search?q=${titleEnc}`,
};

// Helper : ajoute tracking + redirection sur un bouton/lien
function bindStreamLink(elemId, platform) {
  const elem = el(elemId);
  if (!elem) return;
  elem.href = urls[platform];
  elem.addEventListener('click', async (e) => {
    e.preventDefault();
    await trackClick(platform, id);           // ← tracking Firebase
    window.open(urls[platform], '_blank');     // ← redirection
  });
}

bindStreamLink('watchCrunchyBtn',  'crunchyroll');
bindStreamLink('watchNetflixBtn',  'netflix');
bindStreamLink('streamCrunchyroll','crunchyroll');
bindStreamLink('streamNetflix',    'netflix');
bindStreamLink('streamADN',        'adn');
*/


/* ─────────────────────────────────────────────────────
   ▼ RÉSUMÉ DES CHEMINS FIRESTORE CRÉÉS
─────────────────────────────────────────────────────── */
/*
  stats/views/anime/{animeId}
    → { total: number, lastSeen: timestamp, createdAt: timestamp }

  stats/clicks/crunchyroll/{animeId}
  stats/clicks/netflix/{animeId}
  stats/clicks/adn/{animeId}
    → { total: number, lastClick: timestamp, createdAt: timestamp }

  events/{autoId}
    → { type: 'view'|'click', animeId, platform?, timestamp }

  stats/duels/battles/{animeIdA_animeIdB}
    → { animeA, animeB, votesA: number, votesB: number, createdAt }
*/
