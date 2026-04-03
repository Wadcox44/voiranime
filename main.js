/* ═══════════════════════════════════════════════════
   main.js — VoirAnime Homepage
   Gère : Hero rotatif · Carousels · Search instant · Favoris · Historique
   ═══════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────
   CONFIG & STATE
────────────────────────────────────── */
const API = 'https://api.jikan.moe/v4';
const HERO_INTERVAL = 7000; // ms entre chaque anime hero

const state = {
  heroAnimes: [],
  heroIndex: 0,
  heroTimer: null,
  searchTimer: null,
  searchActive: false,
};

/* ──────────────────────────────────────
   UTILS
────────────────────────────────────── */

/** Fetch avec retry auto sur rate limit (429) */
async function jikanFetch(endpoint, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}${endpoint}`);
      if (res.status === 429) {
        await sleep(1200 * (i + 1));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(600);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function el(id) { return document.getElementById(id); }

function showToast(msg, duration = 2800) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Favorites ── */
function getFavs() {
  try { return JSON.parse(localStorage.getItem('VoirAnime_favs') || '[]'); }
  catch { return []; }
}
function saveFavs(favs) { localStorage.setItem('VoirAnime_favs', JSON.stringify(favs)); }
function isFav(id) { return getFavs().some(f => f.id === id); }

function toggleFav(id, title, img) {
  const favs = getFavs();
  const idx = favs.findIndex(f => f.id === id);
  if (idx > -1) {
    favs.splice(idx, 1);
    showToast(`💔 ${title} retiré des favoris`);
  } else {
    favs.unshift({ id, title, img });
    showToast(`❤ ${title} ajouté aux favoris`);
  }
  saveFavs(favs);
  updateFavUI();
  renderFavoritesSection();
  return idx === -1;
}

function updateFavUI() {
  const favs = getFavs();
  const badge = el('navFavCount');
  if (badge) badge.textContent = favs.length;

  // Update all fav buttons on page
  document.querySelectorAll('[data-fav-id]').forEach(btn => {
    const id = parseInt(btn.dataset.favId);
    btn.classList.toggle('active', isFav(id));
  });
}

/* ── Watch History ── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem('VoirAnime_history') || '[]'); }
  catch { return []; }
}

function addToHistory(id, title, img, progress = 0) {
  const hist = getHistory().filter(h => h.id !== id);
  hist.unshift({ id, title, img, progress, ts: Date.now() });
  localStorage.setItem('VoirAnime_history', JSON.stringify(hist.slice(0, 20)));
}

/* ──────────────────────────────────────
   SKELETON BUILDER
────────────────────────────────────── */
function buildSkeletons(container, count = 8) {
  container.innerHTML = Array.from({ length: count }, () => `
    <div class="sk-card">
      <div class="sk-block sk-card-img"></div>
      <div class="sk-block sk-card-txt"></div>
      <div class="sk-block sk-card-txt2"></div>
    </div>
  `).join('');
}

/* ──────────────────────────────────────
   CARD BUILDER
────────────────────────────────────── */
function buildCard(anime, opts = {}) {
  const { rank = null, showProgress = false, progress = 60 } = opts;

  const id     = anime.mal_id;
  const title  = anime.title_english || anime.title || 'Titre inconnu';
  const img    = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score  = anime.score;
  const type   = anime.type || '';
  const fav    = isFav(id);

  const card = document.createElement('article');
  card.className = 'anime-card' + (showProgress ? ' continue-card' : '');
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');

  card.innerHTML = `
    <div class="card-thumb">
      <img src="${img}" alt="${title}" loading="lazy"
           onerror="this.src='https://placehold.co/160x230/111118/555?text=No+Image'"/>
      <div class="card-thumb-overlay">
        <div class="card-play-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        ${score ? `<div class="card-score-badge">★ ${score.toFixed(1)}</div>` : ''}
      </div>
      ${type ? `<span class="card-type-badge">${type}</span>` : ''}
      ${rank ? `<span class="card-rank-badge">#${rank}</span>` : ''}
      <button class="card-fav-btn ${fav ? 'active' : ''}" data-fav-id="${id}" aria-label="Favori">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      ${showProgress ? `
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${progress}%"></div>
        </div>` : ''}
    </div>
    <div class="card-info">
      <h3 class="card-title">${title}</h3>
      <p class="card-sub">${score ? `★ ${score.toFixed(1)}` : ''}${score && type ? ' · ' : ''}${type}</p>
    </div>
  `;

  /* Click → detail */
  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-fav-btn')) return;
    addToHistory(id, title, img, showProgress ? progress : 0);
    window.location.href = `anime.html?id=${id}`;
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.location.href = `anime.html?id=${id}`;
  });

  /* Fav button */
  card.querySelector('.card-fav-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const added = toggleFav(id, title, img);
    const btn = e.currentTarget;
    btn.classList.toggle('active', added);
    btn.querySelector('svg').setAttribute('fill', added ? 'currentColor' : 'none');
  });

  return card;
}

/* ──────────────────────────────────────
   CAROUSEL RENDERER
────────────────────────────────────── */
function renderCarousel(carouselId, animes, opts = {}) {
  const container = el(`carousel-${carouselId}`);
  if (!container) return;
  container.innerHTML = '';
  animes.forEach((anime, i) => {
    container.appendChild(buildCard(anime, {
      rank: opts.showRank ? i + 1 : null,
      ...opts
    }));
  });
}

/* ──────────────────────────────────────
   CAROUSEL NAVIGATION
────────────────────────────────────── */
function initCarouselButtons() {
  document.querySelectorAll('.carousel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id      = btn.dataset.carousel;
      const carousel = el(`carousel-${id}`);
      if (!carousel) return;
      const step = carousel.clientWidth * 0.75;
      carousel.scrollBy({ left: btn.classList.contains('prev') ? -step : step, behavior: 'smooth' });
    });
  });
}

/* ──────────────────────────────────────
   HERO
────────────────────────────────────── */
function renderHero(anime) {
  const imgEl    = el('heroImg');
  const titleEl  = el('heroTitle');
  const synEl    = el('heroSynopsis');
  const badgesEl = el('heroBadges');
  const metaEl   = el('heroMeta');
  const playBtn  = el('heroPlayBtn');
  const moreBtn  = el('heroMoreBtn');
  const favBtn   = el('heroFavBtn');
  const skeleton = el('heroSkeleton');
  const info     = el('heroInfo');

  const id      = anime.mal_id;
  const title   = anime.title_english || anime.title;
  const img     = anime.images?.jpg?.large_image_url || '';
  const synopsis = (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/gi, '').trim();

  // Image transition
  imgEl.style.opacity = '0';
  imgEl.src = img;
  imgEl.onload = () => { imgEl.style.opacity = '1'; };

  titleEl.textContent = title;
  synEl.textContent   = synopsis.slice(0, 200) + (synopsis.length > 200 ? '…' : '');

  // Badges
  const badges = [];
  if (anime.score)    badges.push(`<span class="badge badge-gold">★ ${anime.score.toFixed(1)}</span>`);
  if (anime.type)     badges.push(`<span class="badge badge-muted">${anime.type}</span>`);
  if (anime.status === 'Currently Airing') badges.push(`<span class="badge badge-green">● EN COURS</span>`);
  badgesEl.innerHTML = badges.join('');

  // Meta
  const meta = [
    anime.year     ? `📅 ${anime.year}`           : null,
    anime.episodes ? `🎬 ${anime.episodes} ep.`   : null,
    anime.rating   ? anime.rating.split(' ')[0]   : null,
  ].filter(Boolean);
  metaEl.innerHTML = meta.map(m => `<span class="hero-meta-item">${m}</span>`).join('');

  // Actions
  playBtn.href = `anime.html?id=${id}`;
  moreBtn.onclick = () => { window.location.href = `anime.html?id=${id}`; };
  favBtn.dataset.id = id;
  favBtn.classList.toggle('active', isFav(id));
  favBtn.onclick = () => {
    const fav = toggleFav(id, title, img);
    favBtn.classList.toggle('active', fav);
  };

  // Reveal
  skeleton.classList.add('hidden');
  info.classList.remove('hidden');
}

function updateHeroDots() {
  const dotsEl = el('heroDots');
  dotsEl.innerHTML = state.heroAnimes.map((_, i) =>
    `<div class="hero-dot ${i === state.heroIndex ? 'active' : ''}" data-i="${i}"></div>`
  ).join('');
  dotsEl.querySelectorAll('.hero-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      clearInterval(state.heroTimer);
      state.heroIndex = parseInt(dot.dataset.i);
      renderHero(state.heroAnimes[state.heroIndex]);
      updateHeroDots();
      startHeroRotation();
    });
  });
}

function startHeroRotation() {
  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    state.heroIndex = (state.heroIndex + 1) % state.heroAnimes.length;
    renderHero(state.heroAnimes[state.heroIndex]);
    updateHeroDots();
  }, HERO_INTERVAL);
}

/* ──────────────────────────────────────
   SEARCH
────────────────────────────────────── */
function initSearch() {
  const toggle    = el('searchToggle');
  const expand    = el('searchExpand');
  const input     = el('searchInput');
  const clearBtn  = el('searchClear');
  const overlay   = el('searchOverlay');
  const closeBtn  = el('searchOverlayClose');

  toggle.addEventListener('click', () => {
    expand.classList.toggle('active');
    if (expand.classList.contains('active')) {
      input.focus();
      overlay.classList.remove('active');
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    overlay.classList.remove('active');
    el('searchResultsGrid').innerHTML = '';
  });

  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    expand.classList.remove('active');
    input.value = '';
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(state.searchTimer);
    if (q.length < 2) {
      overlay.classList.remove('active');
      return;
    }
    state.searchTimer = setTimeout(() => performSearch(q), 400);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      overlay.classList.remove('active');
      expand.classList.remove('active');
      input.value = '';
    }
  });
}

async function performSearch(query) {
  const overlay  = el('searchOverlay');
  const grid     = el('searchResultsGrid');
  const loader   = el('searchLoader');
  const empty    = el('searchEmpty');
  const label    = el('searchLabel');

  overlay.classList.add('active');
  grid.innerHTML = '';
  empty.classList.remove('visible');
  loader.classList.add('visible');
  label.textContent = `Recherche : « ${query} »`;

  try {
    const data = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`);
    loader.classList.remove('visible');
    const results = data.data || [];

    if (results.length === 0) {
      empty.classList.add('visible');
      return;
    }
    label.textContent = `${results.length} résultat${results.length > 1 ? 's' : ''} pour « ${query} »`;
    results.forEach(anime => grid.appendChild(buildCard(anime)));

  } catch (e) {
    loader.classList.remove('visible');
    label.textContent = 'Erreur de connexion. Réessaie dans quelques secondes.';
    console.error(e);
  }
}

/* ──────────────────────────────────────
   FAVORITES SECTION
────────────────────────────────────── */
function renderFavoritesSection() {
  const section  = el('section-favorites');
  const carousel = el('carousel-favorites');
  const favs     = getFavs();

  if (favs.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  carousel.innerHTML = '';
  favs.forEach(f => {
    // Build a minimal card from stored data
    const fake = {
      mal_id: f.id,
      title: f.title,
      title_english: f.title,
      images: { jpg: { large_image_url: f.img, image_url: f.img } },
      score: null, type: null
    };
    carousel.appendChild(buildCard(fake));
  });
}

/* ──────────────────────────────────────
   CONTINUE WATCHING
────────────────────────────────────── */
function renderContinueWatching() {
  const section  = el('section-continue');
  const carousel = el('carousel-continue');
  const hist = getHistory();

  if (hist.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  carousel.innerHTML = '';
  hist.slice(0, 10).forEach(h => {
    const fake = {
      mal_id: h.id,
      title: h.title,
      title_english: h.title,
      images: { jpg: { large_image_url: h.img } },
      score: null, type: null
    };
    carousel.appendChild(buildCard(fake, { showProgress: true, progress: h.progress || 45 }));
  });
}

/* ──────────────────────────────────────
   NAVBAR SCROLL EFFECT
────────────────────────────────────── */
function initNavbar() {
  const nav = el('navbar');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 80);
  }, { passive: true });
}

/* ──────────────────────────────────────
   DATA LOADING
────────────────────────────────────── */

// Stagger API calls to avoid hitting rate limit
async function loadSection(endpointPath, carouselId, skeletonId, count = 8, opts = {}) {
  const skelEl = el(skeletonId);
  if (skelEl) buildSkeletons(skelEl.parentElement, count);

  try {
    await sleep(opts.delay || 0);
    const data = await jikanFetch(endpointPath);
    const animes = data.data || [];
    renderCarousel(carouselId, animes, opts);
  } catch (e) {
    const c = el(`carousel-${carouselId}`);
    if (c) c.innerHTML = `<p style="color:var(--muted);padding:20px;font-size:0.85rem;">Impossible de charger cette section.</p>`;
    console.error(`Section ${carouselId}:`, e);
  }
}

async function loadHero() {
  try {
    // Use top airing for hero
    const data = await jikanFetch('/top/anime?filter=airing&limit=10');
    state.heroAnimes = (data.data || []).filter(a => a.images?.jpg?.large_image_url);
    if (state.heroAnimes.length === 0) return;

    renderHero(state.heroAnimes[0]);
    updateHeroDots();
    startHeroRotation();
  } catch (e) {
    console.error('Hero load error:', e);
    el('heroSkeleton').innerHTML = '<p style="color:var(--muted)">Impossible de charger le hero.</p>';
  }
}

/* ──────────────────────────────────────
   INIT
────────────────────────────────────── */
async function init() {
  initNavbar();
  initSearch();
  initCarouselButtons();
  updateFavUI();
  renderFavoritesSection();
  renderContinueWatching();

  // Load hero first
  await loadHero();

  // Load sections with staggered delays to respect rate limit
  loadSection('/top/anime?filter=bypopularity&limit=20', 'popular', 'skel-popular', 10, { delay: 300, showRank: true });
  loadSection('/top/anime?limit=20',                     'top',     'skel-top',     10, { delay: 700 });
  loadSection('/top/anime?filter=airing&limit=20',       'airing',  'skel-airing',  10, { delay: 1100 });
  loadSection('/top/anime?type=movie&limit=20',          'movies',  'skel-movies',  10, { delay: 1500 });
}

document.addEventListener('DOMContentLoaded', init);
