/* ═══════════════════════════════════════════════════
   anime.js — AniVault Detail Page
   Gère : Détails anime · Trailer YouTube · Favoris · Recommandations
   ═══════════════════════════════════════════════════ */
import { trackView, trackClick } from './firebase.js';
'use strict';

const API = 'https://api.jikan.moe/v4';

/* ──────────────────────────────────────
   UTILS
────────────────────────────────────── */
function el(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function jikanFetch(endpoint, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${API}${endpoint}`);
      if (res.status === 429) { await sleep(1200 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(600);
    }
  }
}

function showToast(msg, duration = 2800) {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ── Favorites ── */
function getFavs() {
  try { return JSON.parse(localStorage.getItem('anivault_favs') || '[]'); } catch { return []; }
}
function saveFavs(f) { localStorage.setItem('anivault_favs', JSON.stringify(f)); }
function isFav(id) { return getFavs().some(f => f.id === id); }

function toggleFav(id, title, img) {
  const favs = getFavs();
  const idx  = favs.findIndex(f => f.id === id);
  if (idx > -1) { favs.splice(idx, 1); showToast(`💔 ${title} retiré des favoris`); }
  else           { favs.unshift({ id, title, img }); showToast(`❤ ${title} ajouté aux favoris`); }
  saveFavs(favs);
  return idx === -1;
}

/* ── History ── */
function addToHistory(id, title, img, progress = 0) {
  try {
    const hist = JSON.parse(localStorage.getItem('anivault_history') || '[]').filter(h => h.id !== id);
    hist.unshift({ id, title, img, progress, ts: Date.now() });
    localStorage.setItem('anivault_history', JSON.stringify(hist.slice(0, 20)));
  } catch {}
}

/* ──────────────────────────────────────
   CARD BUILDER (for recommendations)
────────────────────────────────────── */
function buildRecoCard(anime) {
  const id    = anime.mal_id;
  const title = anime.title_english || anime.title || 'Titre inconnu';
  const img   = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score = anime.score;
  const type  = anime.type || '';
  const fav   = isFav(id);

  const card = document.createElement('article');
  card.className = 'anime-card';

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
      <button class="card-fav-btn ${fav ? 'active' : ''}" data-fav-id="${id}" aria-label="Favori">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </div>
    <div class="card-info">
      <h3 class="card-title">${title}</h3>
      <p class="card-sub">${score ? `★ ${score.toFixed(1)}` : ''}${score && type ? ' · ' : ''}${type}</p>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-fav-btn')) return;
    addToHistory(id, title, img);
    window.location.href = `anime.html?id=${id}`;
  });

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
   TRAILER LOGIC
────────────────────────────────────── */
const trailerState = { youtubeId: null, playing: false, muted: true };

function embedTrailer(youtubeId) {
  trailerState.youtubeId = youtubeId;
  const playBtn   = el('playTrailerBtn');
  const unmuteBtn = el('unmuteBtn');
  playBtn.classList.remove('hidden');

  playBtn.addEventListener('click', () => {
    if (!trailerState.playing) {
      startTrailer(youtubeId);
    }
  });

  unmuteBtn.addEventListener('click', () => {
    toggleMute();
  });
}

function startTrailer(youtubeId) {
  const container = el('trailerContainer');
  const banner    = el('animeBanner');
  const frame     = el('trailerFrame');
  const playBtn   = el('playTrailerBtn');
  const unmuteBtn = el('unmuteBtn');

  // Autoplay muted via YouTube embed params
  frame.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&enablejsapi=1`;

  container.classList.add('active');
  banner.style.opacity = '0';
  playBtn.classList.add('hidden');
  unmuteBtn.classList.remove('hidden');
  trailerState.playing = true;
  trailerState.muted   = true;
  el('muteLabel').textContent = 'Activer le son';
  el('muteIcon').innerHTML = `
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
  `;
}

function toggleMute() {
  const frame     = el('trailerFrame');
  const youtubeId = trailerState.youtubeId;
  const muteIcon  = el('muteIcon');
  const muteLabel = el('muteLabel');

  trailerState.muted = !trailerState.muted;

  // Re-embed with mute param toggled (simplest approach without postMessage auth)
  const muteParam = trailerState.muted ? 1 : 0;
  frame.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=${muteParam}&controls=0&modestbranding=1&rel=0`;

  if (trailerState.muted) {
    muteLabel.textContent = 'Activer le son';
    muteIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
    `;
  } else {
    muteLabel.textContent = 'Couper le son';
    muteIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
    `;
  }
}

/* ──────────────────────────────────────
   CAROUSEL NAV (recommendations)
────────────────────────────────────── */
function initCarouselButtons() {
  document.querySelectorAll('.carousel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id       = btn.dataset.carousel;
      const carousel = el(`carousel-${id}`);
      if (!carousel) return;
      const step = carousel.clientWidth * 0.75;
      carousel.scrollBy({ left: btn.classList.contains('prev') ? -step : step, behavior: 'smooth' });
    });
  });
}

/* ──────────────────────────────────────
   NAVBAR SCROLL
────────────────────────────────────── */
function initNavbar() {
  const nav = el('navbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 100) {
      nav.classList.remove('transparent');
      nav.classList.add('scrolled');
    } else {
      nav.classList.add('transparent');
      nav.classList.remove('scrolled');
    }
  }, { passive: true });
}

/* ──────────────────────────────────────
   RENDER ANIME DETAIL
────────────────────────────────────── */
function renderDetail(anime) {
  const id      = anime.mal_id;
  const title   = anime.title_english || anime.title || '';
  const titleJp = anime.title_japanese || '';
  const img     = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const synopsis = (anime.synopsis || 'Aucun synopsis disponible.')
                   .replace(/\[Written by MAL Rewrite\]/gi, '').trim();

  // Page title
  document.title = `AniVault — ${title}`;

  // Banner
  el('bannerImg').src = img;
  el('bannerImg').alt = title;
  el('bannerImg').onerror = () => {
    el('bannerImg').src = 'https://placehold.co/1200x600/111118/555?text=No+Image';
  };

  // Trailer
  const trailer = anime.trailer?.youtube_id;
  if (trailer) {
    embedTrailer(trailer);
    el('trailerRating').textContent = anime.rating ? anime.rating.split(' ')[0] : '';
  } else {
    el('playTrailerBtn').style.opacity = '0.4';
    el('playTrailerBtn').disabled = true;
    el('playTrailerBtn').textContent = 'Aucune bande-annonce disponible';
  }

  // Badges
  const badges = [];
  if (anime.score)  badges.push(`<span class="badge badge-gold">★ ${anime.score.toFixed(1)}</span>`);
  if (anime.type)   badges.push(`<span class="badge badge-muted">${anime.type}</span>`);
  if (anime.status === 'Currently Airing') badges.push(`<span class="badge badge-green">● En cours</span>`);
  if (anime.rating) badges.push(`<span class="badge badge-muted">${anime.rating.split(' ')[0]}</span>`);
  el('animeBadges').innerHTML = badges.join('');

  // Title
  el('animeTitle').textContent = title;
  el('animeTitleJp').textContent = titleJp;

  // Quick stats
  const stats = [
    anime.score    ? { val: anime.score.toFixed(1), label: 'Score' }  : null,
    anime.episodes ? { val: anime.episodes, label: 'Épisodes' }       : null,
    anime.year     ? { val: anime.year, label: 'Année' }              : null,
    anime.members  ? { val: fmtNum(anime.members), label: 'Membres' } : null,
  ].filter(Boolean);

  el('animeQuickStats').innerHTML = stats.map(s => `
    <div class="stat-item">
      <div class="stat-value">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('');

  // Watch buttons
  const titleEnc = encodeURIComponent(title);
  const crunchyBtn = el('watchCrunchyBtn');
const netflixBtn = el('watchNetflixBtn');

const crunchyUrl = `https://www.crunchyroll.com/search?q=${titleEnc}`;
const netflixUrl = `https://www.netflix.com/search?q=${titleEnc}`;

crunchyBtn.addEventListener("click", (e) => {
  e.preventDefault();
  trackClick("crunchyroll", id);
  window.open(crunchyUrl, "_blank");
});

netflixBtn.addEventListener("click", (e) => {
  e.preventDefault();
  trackClick("netflix", id);
  window.open(netflixUrl, "_blank");
});

  // Streaming aside links
  // Streaming aside links (avec tracking Firebase)

const streamCrunchy = el('streamCrunchyroll');
const streamNetflix = el('streamNetflix');
const streamADN = el('streamADN');

const crunchyUrl = `https://www.crunchyroll.com/search?q=${titleEnc}`;
const netflixUrl = `https://www.netflix.com/search?q=${titleEnc}`;
const adnUrl = `https://animedigitalnetwork.fr/video/search?q=${titleEnc}`;

if (streamCrunchy) {
  streamCrunchy.addEventListener("click", (e) => {
    e.preventDefault();
    trackClick("crunchyroll", id);
    window.open(crunchyUrl, "_blank");
  });
}

if (streamNetflix) {
  streamNetflix.addEventListener("click", (e) => {
    e.preventDefault();
    trackClick("netflix", id);
    window.open(netflixUrl, "_blank");
  });
}

if (streamADN) {
  streamADN.addEventListener("click", (e) => {
    e.preventDefault();
    trackClick("adn", id);
    window.open(adnUrl, "_blank");
  });
}

  // Fav buttons
  const fav = isFav(id);
  [el('animeFavBtn'), el('navFavBtn')].forEach(btn => {
    if (!btn) return;
    btn.dataset.id = id;
    btn.classList.toggle('active', fav);
    el('favBtnLabel').textContent = fav ? '❤ En favoris' : '+ Favori';

    btn.addEventListener('click', () => {
      const added = toggleFav(id, title, img);
      [el('animeFavBtn'), el('navFavBtn')].forEach(b => b && b.classList.toggle('active', added));
      el('favBtnLabel').textContent = added ? '❤ En favoris' : '+ Favori';
    });
  });

  // Synopsis
  const synEl = el('animeSynopsis');
  synEl.textContent = synopsis;
  const toggleEl = el('synopsisToggle');
  let expanded = false;
  toggleEl.addEventListener('click', () => {
    expanded = !expanded;
    synEl.classList.toggle('expanded', expanded);
    toggleEl.textContent = expanded ? 'Réduire ▲' : 'Lire plus ▼';
  });

  // Genres
  const genres = [...(anime.genres || []), ...(anime.themes || []), ...(anime.demographics || [])];
  el('animeGenres').innerHTML = genres.length
    ? genres.map(g => `<span class="tag">${g.name}</span>`).join('')
    : '<span class="tag">Non renseigné</span>';

  // Score widget
  if (anime.score) {
    el('scoreValue').textContent = anime.score.toFixed(1);
    el('scoreVoters').textContent = anime.scored_by ? `${fmtNum(anime.scored_by)} votes` : '';
    el('scoreRank').textContent   = anime.rank ? `Rang #${anime.rank}` : '';
  }

  // Info table
  const rows = [
    { k: 'Titre JP',   v: titleJp || '—' },
    { k: 'Type',       v: anime.type || '—' },
    { k: 'Épisodes',   v: anime.episodes ? `${anime.episodes}` : '—' },
    { k: 'Durée',      v: anime.duration || '—' },
    { k: 'Statut',     v: anime.status || '—' },
    { k: 'Diffusion',  v: anime.aired?.string || '—' },
    { k: 'Studio',     v: (anime.studios || []).map(s => s.name).join(', ') || '—' },
    { k: 'Source',     v: anime.source || '—' },
    { k: 'Saison',     v: anime.season ? `${cap(anime.season)} ${anime.year}` : '—' },
    { k: 'Popularité', v: anime.popularity ? `#${anime.popularity}` : '—' },
  ];

  el('infoTable').innerHTML = rows.map(r => `
    <div class="info-row">
      <span class="info-key">${r.k}</span>
      <span class="info-val">${r.v}</span>
    </div>
  `).join('');

  // Add to history
  addToHistory(id, title, img, 0);
}

function fmtNum(n) {
  if (!n) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'k';
  return n.toString();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/* ──────────────────────────────────────
   RECOMMENDATIONS
────────────────────────────────────── */
async function loadRecommendations(id) {
  const carousel = el('carousel-reco');
  carousel.innerHTML = '<p style="color:var(--muted);padding:16px;font-size:0.85rem;">Chargement…</p>';

  try {
    await sleep(600); // respect rate limit
    const data = await jikanFetch(`/anime/${id}/recommendations`);
    const items = (data.data || []).slice(0, 20);

    carousel.innerHTML = '';
    if (items.length === 0) {
      carousel.innerHTML = '<p style="color:var(--muted);padding:16px;font-size:0.85rem;">Aucune recommandation disponible.</p>';
      return;
    }

    items.forEach(item => {
      const anime = item.entry;
      carousel.appendChild(buildRecoCard({
        mal_id: anime.mal_id,
        title: anime.title,
        title_english: anime.title,
        images: anime.images,
        score: null,
        type: null,
      }));
    });
  } catch (e) {
    carousel.innerHTML = '<p style="color:var(--muted);padding:16px;font-size:0.85rem;">Impossible de charger les recommandations.</p>';
    console.error('Reco error:', e);
  }
}

/* ──────────────────────────────────────
   SKELETON
────────────────────────────────────── */
function showDetailSkeleton() {
  const sk = el('detailSkeleton');
  if (sk) sk.style.display = 'block';
  // Hide real content
  ['animeHeader', 'animeSynopsisBlock', 'animeGenresBlock'].forEach(id => {
    const e = document.querySelector(`.${id.replace(/([A-Z])/g, '-$1').toLowerCase()}`);
  });
}

function hidePageLoader() {
  const loader = el('pageLoader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 450);
  }
  const sk = el('detailSkeleton');
  if (sk) sk.style.display = 'none';
}

/* ──────────────────────────────────────
   INIT
────────────────────────────────────── */
async function init() {
  initNavbar();
  initCarouselButtons();

  const params  = new URLSearchParams(window.location.search);
  const animeId = params.get('id');
trackView(animeId);
  if (!animeId) {
    hidePageLoader();
    el('pageLoader').innerHTML = `
      <div style="text-align:center;color:var(--muted)">
        <p style="font-size:2rem;margin-bottom:12px">（；￣д￣）</p>
        <p>Aucun anime spécifié. <a href="index.html" style="color:var(--accent)">← Retour</a></p>
      </div>`;
    return;
  }

  try {
    const data = await jikanFetch(`/anime/${animeId}/full`);
    renderDetail(data.data);
    hidePageLoader();
    // Load recommendations after detail is shown
    loadRecommendations(animeId);
  } catch (e) {
    hidePageLoader();
    const content = el('animeContent');
    if (content) content.innerHTML = `
      <div style="text-align:center;color:var(--muted);padding:80px 20px;grid-column:1/-1">
        <p style="font-size:2rem;margin-bottom:12px">（；￣д￣）</p>
        <p>Impossible de charger cet anime.</p>
        <a href="index.html" style="color:var(--accent);margin-top:16px;display:inline-block">← Retour à l'accueil</a>
      </div>`;
    console.error('Init error:', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
