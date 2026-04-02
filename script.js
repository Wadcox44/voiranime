/* ============================================================
   script.js — AniSearch
   Gère : recherche (index.html) + détail (anime.html)
   ============================================================ */

const JIKAN_BASE = 'https://api.jikan.moe/v4';

/* ──────────────────────────────────────────────
   UTILITAIRES
────────────────────────────────────────────── */

function show(el)  { el.classList.remove('hidden'); }
function hide(el)  { el.classList.add('hidden'); }

function stars(score) {
  if (!score) return '';
  const filled = Math.round(score / 2);   // MAL score /10 → /5 étoiles
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="${i < filled ? 'star filled' : 'star'}">★</span>`
  ).join('');
}

/* ──────────────────────────────────────────────
   PAGE : INDEX (recherche)
────────────────────────────────────────────── */

if (document.body.classList.contains('page-home')) {

  const input       = document.getElementById('searchInput');
  const clearBtn    = document.getElementById('clearBtn');
  const cardsGrid   = document.getElementById('cardsGrid');
  const loader      = document.getElementById('loader');
  const emptyState  = document.getElementById('emptyState');
  const resultsHeader = document.getElementById('resultsHeader');

  let debounceTimer = null;

  /* ── Debounce search ── */
  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearBtn.style.opacity = q ? '1' : '0';

    clearTimeout(debounceTimer);
    if (q.length < 2) {
      resetResults();
      return;
    }
    debounceTimer = setTimeout(() => searchAnime(q), 450);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.opacity = '0';
    input.focus();
    resetResults();
  });

  /* ── Recherche principale ── */
  async function searchAnime(query) {
    resetResults();
    show(loader);

    try {
      const res  = await fetch(`${JIKAN_BASE}/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      hide(loader);
      const items = data.data || [];

      if (items.length === 0) {
        show(emptyState);
        return;
      }

      resultsHeader.textContent = `${items.length} résultat${items.length > 1 ? 's' : ''} pour « ${query} »`;
      renderCards(items);

    } catch (err) {
      hide(loader);
      resultsHeader.textContent = 'Erreur de connexion à l\'API. Réessaie dans quelques secondes.';
      console.error(err);
    }
  }

  /* ── Render cards ── */
  function renderCards(animes) {
    cardsGrid.innerHTML = '';
    animes.forEach((anime, i) => {
      const card = document.createElement('article');
      card.className = 'anime-card';
      card.style.animationDelay = `${i * 40}ms`;

      const score    = anime.score ? anime.score.toFixed(1) : 'N/A';
      const imageUrl = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
      const title    = anime.title_english || anime.title || 'Titre inconnu';
      const episodes = anime.episodes ? `${anime.episodes} ep.` : '';
      const type     = anime.type || '';

      card.innerHTML = `
        <div class="card-img-wrap">
          <img src="${imageUrl}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/220x310/1a1a2e/666?text=No+Image'"/>
          <div class="card-overlay">
            <span class="card-score">★ ${score}</span>
          </div>
          ${type ? `<span class="card-type-badge">${type}</span>` : ''}
        </div>
        <div class="card-info">
          <h3 class="card-title">${title}</h3>
          ${episodes ? `<span class="card-eps">${episodes}</span>` : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        window.location.href = `anime.html?id=${anime.mal_id}`;
      });

      cardsGrid.appendChild(card);
    });
  }

  /* ── Reset ── */
  function resetResults() {
    cardsGrid.innerHTML  = '';
    resultsHeader.textContent = '';
    hide(loader);
    hide(emptyState);
  }
}

/* ──────────────────────────────────────────────
   PAGE : ANIME DETAIL
────────────────────────────────────────────── */

if (document.body.classList.contains('page-detail')) {

  const loaderFull  = document.getElementById('loaderFull');
  const detailMain  = document.getElementById('detailMain');
  const errorState  = document.getElementById('errorState');

  const params = new URLSearchParams(window.location.search);
  const animeId = params.get('id');

  if (!animeId) {
    hide(loaderFull);
    show(errorState);
  } else {
    loadAnimeDetail(animeId);
  }

  async function loadAnimeDetail(id) {
    try {
      const res  = await fetch(`${JIKAN_BASE}/anime/${id}/full`);
      if (!res.ok) throw new Error('Not found');
      const data = await res.json();
      renderDetail(data.data);
    } catch (err) {
      hide(loaderFull);
      show(errorState);
      console.error(err);
    }
  }

  function renderDetail(anime) {
    /* Titre de la page */
    document.title = `AniSearch — ${anime.title_english || anime.title}`;

    /* Banner */
    const bannerImg = document.getElementById('bannerImg');
    bannerImg.src = anime.images?.jpg?.large_image_url || '';
    bannerImg.alt = anime.title;

    /* Poster */
    const posterImg = document.getElementById('posterImg');
    posterImg.src = anime.images?.jpg?.large_image_url || '';
    posterImg.alt = anime.title;
    posterImg.onerror = () => {
      posterImg.src = 'https://placehold.co/280x400/1a1a2e/666?text=No+Image';
    };

    /* Badges */
    const badgesRow = document.getElementById('badgesRow');
    const badges = [anime.type, anime.status, anime.rating].filter(Boolean);
    badgesRow.innerHTML = badges.map(b => `<span class="badge">${b}</span>`).join('');

    /* Titre */
    document.getElementById('detailTitle').textContent =
      anime.title_english || anime.title;

    /* Meta */
    const metaItems = [
      anime.year ? `📅 ${anime.year}` : null,
      anime.episodes ? `🎬 ${anime.episodes} épisodes` : null,
      anime.duration ? `⏱ ${anime.duration}` : null,
    ].filter(Boolean);
    document.getElementById('metaRow').innerHTML =
      metaItems.map(m => `<span class="meta-item">${m}</span>`).join('');

    /* Score */
    const score = anime.score;
    if (score) {
      document.getElementById('scoreNum').textContent = score.toFixed(1);
      document.getElementById('scoreStars').innerHTML = stars(score);
    } else {
      hide(document.getElementById('scoreBlock'));
    }

    /* Synopsis */
    const rawSynopsis = anime.synopsis || 'Aucun synopsis disponible.';
    // Retirer le texte "[Written by MAL Rewrite]"
    const synopsis = rawSynopsis.replace(/\[Written by MAL Rewrite\]/gi, '').trim();
    document.getElementById('synopsis').textContent = synopsis;

    /* Genres */
    const genres = anime.genres || [];
    const themes = anime.themes || [];
    const allTags = [...genres, ...themes];
    document.getElementById('genresList').innerHTML =
      allTags.length
        ? allTags.map(g => `<span class="genre-tag">${g.name}</span>`).join('')
        : '<span class="genre-tag">Non renseigné</span>';

    /* Boutons streaming */
    const titleEncoded = encodeURIComponent(anime.title_english || anime.title);
    document.getElementById('crunchyrollBtn').href =
      `https://www.crunchyroll.com/search?q=${titleEncoded}`;
    document.getElementById('netflixBtn').href =
      `https://www.netflix.com/search?q=${titleEncoded}`;

    /* Afficher */
    hide(loaderFull);
    show(detailMain);

    /* Animation d'entrée */
    requestAnimationFrame(() => detailMain.classList.add('visible'));
  }
}
