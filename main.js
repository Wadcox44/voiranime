/* ═══════════════════════════════════════════════════
   main.js — VoirAnime Homepage  [VERSION CORRIGÉE]
   Corrections : types id, memory leaks, XSS, module import, robustesse
   ═══════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────
   IMPORTS FIREBASE
   ⚠ index.html doit avoir : <script type="module" src="main.js">
────────────────────────────────────── */
import { trackView } from './firebase.js';

/* ──────────────────────────────────────
   SESSION TIME TRACKER
   Suit le temps passé sur le site en secondes
   Stocké dans VoirAnime_sessionTime (cumulatif)
   Utilisé par les stats Premium dans profile.html
────────────────────────────────────── */
(function initSessionTracker() {
  const KEY      = 'VoirAnime_sessionTime';
  const TICK_MS  = 10000; // incrément toutes les 10s
  let   active   = !document.hidden;
  let   timer    = null;

  function tick() {
    if (!active) return;
    try {
      const current = parseInt(localStorage.getItem(KEY) || '0');
      localStorage.setItem(KEY, String(current + 10));
    } catch {}
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }
  function stopTimer() {
    clearInterval(timer);
    timer = null;
  }

  document.addEventListener('visibilitychange', () => {
    active = !document.hidden;
    active ? startTimer() : stopTimer();
  });

  if (active) startTimer();
})();

/* ──────────────────────────────────────
   CONFIG & STATE
────────────────────────────────────── */
const API = 'https://api.jikan.moe/v4';
const HERO_INTERVAL = 7000;

const state = {
  heroAnimes:  [],
  heroIndex:   0,
  heroTimer:   null,
  searchTimer: null,
};

/* ──────────────────────────────────────
   JIKAN QUEUE + CACHE
   Problème : Jikan limite à 3 req/s et 60 req/min.
   Lancer 4-5 requêtes en parallèle (même avec des délais)
   provoque des 429 car les délais se chevauchent.
   Solution : queue FIFO strictement séquentielle + cache sessionStorage.
────────────────────────────────────── */

const JIKAN_MIN_INTERVAL = 800; // ms minimum entre deux requêtes (ralenti pour éviter les 429)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes de cache sessionStorage

let _lastRequestTime = 0;  // timestamp de la dernière requête partie
let _queue = Promise.resolve(); // chaîne de promesses séquentielles

/**
 * jikanFetch — queue séquentielle + cache sessionStorage + retry 429
 * Toutes les requêtes passent par cette fonction et s'exécutent
 * l'une après l'autre avec un intervalle minimum garanti.
 */
async function jikanFetch(endpoint, retries = 3) {
  // 1. Vérifie le cache sessionStorage
  const cacheKey = `jikan_cache_${endpoint}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) {
        return data; // retour immédiat sans requête réseau
      }
      sessionStorage.removeItem(cacheKey);
    }
  } catch (_) { /* sessionStorage indisponible → on continue sans cache */ }

  // 2. Ajoute la requête à la queue séquentielle
  // Chaque appel attend que le précédent soit terminé
  const result = await (_queue = _queue.then(() => _executeRequest(endpoint, retries, cacheKey)));
  return result;
}

async function _executeRequest(endpoint, retries, cacheKey) {
  // Garantit l'intervalle minimum entre deux requêtes
  const now     = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < JIKAN_MIN_INTERVAL) {
    await sleep(JIKAN_MIN_INTERVAL - elapsed);
  }

  for (let i = 0; i < retries; i++) {
    try {
      _lastRequestTime = Date.now();
      const targetPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      const res = await fetch(`${API}${targetPath}`);

      if (res.status === 429) {
        // Vide le body pour libérer la connexion HTTP/2
        await res.text().catch(() => {});
        const wait = 2000 * (i + 1); // backoff exponentiel : 2s, 4s, 6s
        console.warn(`[Jikan] 429 sur ${endpoint} — retry dans ${wait}ms`);
        await sleep(wait);
        _lastRequestTime = Date.now();
        continue;
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Met en cache dans sessionStorage
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
      } catch (_) { /* quota sessionStorage dépassé → pas grave */ }

      return data;

    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function el(id)    { return document.getElementById(id); }

/** FIX Bug 7 : échappe les caractères dangereux pour éviter XSS dans innerHTML */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(msg, duration = 2800) {
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

/* ──────────────────────────────────────
   FAVORITES
   FIX Bug 1 : tous les ids normalisés en NUMBER
   pour garantir comparaison cohérente (=== entre number et string échouait)
────────────────────────────────────── */
function getFavs() {
  try { return JSON.parse(localStorage.getItem('VoirAnime_favs') || '[]'); }
  catch { return []; }
}

function saveFavs(favs) {
  localStorage.setItem('VoirAnime_favs', JSON.stringify(favs));
}

function isFav(id) {
  const numId = Number(id);
  return getFavs().some(f => Number(f.id) === numId);
}

async function toggleFav(id, title, img) {
  const numId   = Number(id);
  const favs    = getFavs();
  const idx     = favs.findIndex(f => Number(f.id) === numId);
  const adding  = idx === -1;
  const piUser  = window.piAuth?.getUser?.() || (() => {
    try { return JSON.parse(localStorage.getItem('pi_user')); } catch { return null; }
  })();

  // ── Suppression ──────────────────────────────────────────────────────────
  if (!adding) {
    favs.splice(idx, 1);
    saveFavs(favs);
    showToast(t('fav.removed', title));
    updateFavUI();
    renderFavoritesSection();

    // Sync serveur si connecté (non bloquant)
    if (piUser?.uid) {
      fetch('/api/favorites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'remove', piUserId: piUser.uid, animeId: numId }),
      }).catch(() => {});
    }
    return false;
  }

  // ── Ajout : vérification serveur si connecté ─────────────────────────────
  if (piUser?.uid) {
    try {
      const res  = await fetch('/api/favorites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'add', piUserId: piUser.uid, animeId: numId, title, img }),
      });
      const data = await res.json();

      if (res.status === 403 && data.error === 'LIMIT_REACHED') {
        showFavLimitModal(data.count, data.limit);
        return false;
      }

      if (!res.ok) {
        showToast('⚠️ ' + (data.error || 'Server error'));
        return false;
      }

    } catch (e) {
      // Réseau indisponible → fallback localStorage avec vérification locale
      console.warn('[fav] Server check failed, fallback to local limit');
      if (favs.length >= 20) {
        showFavLimitModal(favs.length, 20);
        return false;
      }
    }
  } else {
    // Pas connecté à Pi → limite locale 20
    if (favs.length >= 20) {
      showFavLimitModal(favs.length, 20);
      return false;
    }
  }

  // ── Ajout local ──────────────────────────────────────────────────────────
  favs.unshift({ id: numId, title, img });
  saveFavs(favs);
  showToast(t('fav.added', title));
  updateFavUI();
  renderFavoritesSection();
  return true;
}

/* ── Modal limite favoris Free ──────────────────────────────────────────── */
function showFavLimitModal(count, limit) {
  // Supprimer un éventuel modal existant
  document.getElementById('favLimitModal')?.remove();

  const modal = document.createElement('div');
  modal.id        = 'favLimitModal';
  modal.className = 'fav-limit-modal';
  modal.innerHTML = `
    <div class="fav-limit-box">
      <div class="fav-limit-icon">❤️</div>
      <h3 class="fav-limit-title">Favorites limit reached</h3>
      <p class="fav-limit-msg">
        You have reached the limit of <strong>${limit} favorites</strong> on the free plan.
      </p>
      <div class="fav-limit-bar">
        <div class="fav-limit-fill" style="width:100%"></div>
      </div>
      <p class="fav-limit-count">${count} / ${limit}</p>
      <a href="soutenir.html" class="fav-limit-cta">
        ⭐ Go Premium — Unlimited favorites
        <span class="fav-limit-price">from 1.99 Pi/month</span>
      </a>
      <button class="fav-limit-close" id="favLimitClose">Maybe later</button>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('fav-limit-open'));

  const close = () => {
    modal.classList.remove('fav-limit-open');
    setTimeout(() => modal.remove(), 300);
  };

  document.getElementById('favLimitClose').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}

function updateFavUI() {
  const favs      = getFavs();
  const count     = favs.length;
  const badge     = el('navFavCount');
  const isPremium = window.VA_isPremium?.() || false;
  const FREE_LIMIT = 20;

  // Badge navbar : count + indicateur limite si Free proche du max
  if (badge) {
    badge.textContent = count;
    // Alerte visuelle si Free et ≥ 16/20
    if (!isPremium && count >= FREE_LIMIT * 0.8) {
      badge.classList.add('fav-badge-warning');
    } else {
      badge.classList.remove('fav-badge-warning');
    }
  }

  // Indicateur de progression sous le badge navbar (Free uniquement)
  if (!isPremium) {
    let progressEl = el('navFavProgress');
    if (!progressEl) {
      const favBtn = badge?.closest('a, button');
      if (favBtn) {
        progressEl = document.createElement('div');
        progressEl.id        = 'navFavProgress';
        progressEl.className = 'nav-fav-progress';
        favBtn.appendChild(progressEl);
      }
    }
    if (progressEl) {
      const pct = Math.min((count / FREE_LIMIT) * 100, 100);
      progressEl.innerHTML = `<div class="nav-fav-progress-fill" style="width:${pct}%"></div>`;
      progressEl.title     = `${count} / ${FREE_LIMIT} favorites`;
      progressEl.style.display = count > 0 ? 'block' : 'none';
    }

    // Tooltip sur les boutons ❤ si limite atteinte
    document.querySelectorAll('[data-fav-id]').forEach(btn => {
      if (count >= FREE_LIMIT && !isFav(Number(btn.dataset.favId))) {
        btn.title = `Favorites limit reached (${FREE_LIMIT}). Go Premium for unlimited.`;
        btn.classList.add('fav-btn-at-limit');
      } else {
        btn.title = '';
        btn.classList.remove('fav-btn-at-limit');
      }
    });
  }

  document.querySelectorAll('[data-fav-id]').forEach(btn => {
    const id     = Number(btn.dataset.favId);
    const active = isFav(id);
    btn.classList.toggle('active', active);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', active ? 'currentColor' : 'none');
  });
}

/* ──────────────────────────────────────
   WATCH HISTORY
────────────────────────────────────── */
function getHistory() {
  try { return JSON.parse(localStorage.getItem('VoirAnime_history') || '[]'); }
  catch { return []; }
}

function addToHistory(id, title, img, progress = 0) {
  const numId = Number(id);
  const hist  = getHistory().filter(h => Number(h.id) !== numId);
  hist.unshift({ id: numId, title, img, progress, ts: Date.now() });
  localStorage.setItem('VoirAnime_history', JSON.stringify(hist.slice(0, 20)));
}

/* ──────────────────────────────────────
   SKELETON BUILDER
────────────────────────────────────── */
function buildSkeletons(container, count = 8) {
  if (!container) return; // FIX Bug 5 : guard null
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
   FIX Bug 7 : esc() sur toutes les valeurs dans innerHTML
────────────────────────────────────── */
function buildCard(anime, opts = {}) {
  const { rank = null, showProgress = false, progress = 60 } = opts;

  const id    = Number(anime.mal_id);
  const title = anime.title_english || anime.title || 'Titre inconnu';
  const img   = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score = anime.score;
  const type  = anime.type || '';
  const fav   = isFav(id);

  const card = document.createElement('article');
  card.className = 'anime-card' + (showProgress ? ' continue-card' : '');
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  // Fix scroll vertical bloqué sur mobile : pan-y autorise le scroll natif
  // même quand le doigt démarre sur une card (role=button capture sinon)
  card.style.touchAction = 'pan-y';

  card.innerHTML = `
    <div class="card-thumb">
      <img src="${esc(img)}" alt="${esc(title)}" loading="lazy"
           onerror="this.src='https://placehold.co/160x230/111118/555?text=No+Image'"/>
      <div class="card-thumb-overlay">
        <div class="card-play-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </div>
        ${score ? `<div class="card-score-badge">★ ${score.toFixed(1)}</div>` : ''}
      </div>
      ${type ? `<span class="card-type-badge">${esc(({TV:t('type.tv'),Movie:t('type.movie'),OVA:t('type.ova'),ONA:t('type.ona'),Special:t('type.special')})[type]||type)}</span>` : ''}
      ${rank ? `<span class="card-rank-badge">#${rank}</span>` : ''}
      <button class="card-fav-btn ${fav ? 'active' : ''}" data-fav-id="${id}" aria-label="Favori">
        <svg width="12" height="12" viewBox="0 0 24 24"
             fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
      ${showProgress ? `
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width:${Number(progress)}%"></div>
        </div>` : ''}
    </div>
    <div class="card-info">
      <h3 class="card-title">${esc(title)}</h3>
      <p class="card-sub">${score ? `★ ${score.toFixed(1)}` : ''}${score && type ? ' · ' : ''}${esc(type)}</p>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-fav-btn')) return;
    addToHistory(id, title, img, showProgress ? progress : 0);
    window.location.href = `anime.html?id=${id}`;
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') window.location.href = `anime.html?id=${id}`;
  });

  card.querySelector('.card-fav-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const added = await toggleFav(id, title, img);
    const btn   = e.currentTarget;
    btn.classList.toggle('active', added);
    const svg = btn.querySelector('svg');
    if (svg) svg.setAttribute('fill', added ? 'currentColor' : 'none');
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
      ...opts,
    }));
  });
}

/* ──────────────────────────────────────
   CAROUSEL NAVIGATION
────────────────────────────────────── */
function initCarouselButtons() {
  // Event delegation — 1 seul listener global, jamais dupliqué même si appelé plusieurs fois
  if (window._carouselBtnInit) return;
  window._carouselBtnInit = true;

  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.carousel-btn');
    if (!btn) return;

    const id       = btn.dataset.carousel;
    const carousel = document.getElementById('carousel-' + id);
    if (!carousel) return;

    const firstCard = carousel.querySelector('.anime-card');
    const gap       = parseFloat(getComputedStyle(carousel).gap) || 14;
    // Largeur réelle de la carte CSS (calc() inclus) + gap
    const cardWidth = firstCard ? firstCard.getBoundingClientRect().width + gap : 172;
    const step      = cardWidth * 3;
    const dir       = btn.classList.contains('prev') ? -1 : 1;
    const target    = Math.max(0, carousel.scrollLeft + step * dir);

    // Animation RAF — fiable sur Pi Browser et mobile
    carousel.style.scrollSnapType = 'none';
    carousel.style.scrollBehavior = 'auto';

    const start_pos = carousel.scrollLeft;
    const distance  = target - start_pos;
    const duration  = 280;
    let startTime   = null;

    function ease(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

    function animate(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      carousel.scrollLeft = start_pos + distance * ease(progress);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        carousel.style.scrollSnapType = '';
        carousel.style.scrollBehavior = '';
      }
    }

    requestAnimationFrame(animate);
  });
}


/* ──────────────────────────────────────
   HERO
   FIX Bug 2 & 3 : cloneNode() pour nettoyer les anciens
   event listeners sans avoir à les référencer manuellement
────────────────────────────────────── */
function renderHero(anime) {
  const imgEl    = el('heroImg');
  const titleEl  = el('heroTitle');
  const synEl    = el('heroSynopsis');
  const badgesEl = el('heroBadges');
  const metaEl   = el('heroMeta');
  const skeleton = el('heroSkeleton');
  const info     = el('heroInfo');

  const id       = Number(anime.mal_id);
  const title    = anime.title_english || anime.title;
  const img      = anime.images?.jpg?.large_image_url || '';
  const synopsis = (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/gi, '').trim();

  // Image transition
  imgEl.style.opacity = '0';
  imgEl.src = img;
  imgEl.onload = () => { imgEl.style.opacity = '1'; };

  // Aura dynamique selon les genres de l'anime
  const auraEl = document.getElementById('heroAura');
  const posterImg = document.getElementById('heroPosterImg');
  if (auraEl) {
    const genres = (anime.genres || []).map(g => g.name.toLowerCase());
    auraEl.className = 'hero-aura';
    if      (genres.some(g => ['action','martial arts','sports'].includes(g)))          auraEl.classList.add('aura-action');
    else if (genres.some(g => ['romance','shoujo'].includes(g)))                        auraEl.classList.add('aura-romance');
    else if (genres.some(g => ['sci-fi','mecha','space'].includes(g)))                  auraEl.classList.add('aura-scifi');
    else if (genres.some(g => ['horror','psychological','thriller'].includes(g)))       auraEl.classList.add('aura-horror');
    else if (genres.some(g => ['sports','racing'].includes(g)))                         auraEl.classList.add('aura-sports');
    else                                                                                auraEl.classList.add('aura-fantasy');
  }
  // Poster flottant = même image
  if (posterImg) {
    posterImg.src = img;
    posterImg.alt = title;
    posterImg.onerror = () => { posterImg.style.display = 'none'; };
  }

  // textContent : jamais de XSS
  titleEl.textContent = title;
  synEl.textContent   = synopsis.slice(0, 200) + (synopsis.length > 200 ? '…' : '');

  // Badges
  const badges = [];
  if (anime.score) badges.push(`<span class="badge badge-gold">★ ${anime.score.toFixed(1)}</span>`);
  if (anime.type) {
    const tMap = { TV:t('type.tv'), Movie:"Film d'anime", OVA:t('type.ova'), ONA:t('type.ona'), Special:t('type.special') };
    badges.push(`<span class="badge badge-muted">${esc(tMap[anime.type]||anime.type)}</span>`);
  }
  if (anime.status === 'Currently Airing') badges.push(`<span class="badge badge-green">${t('anime.airing_badge')}</span>`);
  if (anime.status === 'Not yet aired')    badges.push('<span class="badge badge-blue">À venir</span>');
  badgesEl.innerHTML = badges.join('');

  // Meta
  const meta = [
    anime.year     ? `📅 ${anime.year}`         : null,
    anime.episodes ? `🎬 ${anime.episodes} ep.` : null,
    anime.rating   ? anime.rating.split(' ')[0]  : null,
  ].filter(Boolean);
  metaEl.innerHTML = meta.map(m => `<span class="hero-meta-item">${esc(m)}</span>`).join('');

  // FIX Bug 2 : remplace moreBtn par un clone pour vider les anciens listeners
  const moreBtn    = el('heroMoreBtn');
  const newMoreBtn = moreBtn.cloneNode(true);
  moreBtn.parentNode.replaceChild(newMoreBtn, moreBtn);
  newMoreBtn.addEventListener('click', () => { window.location.href = `anime.html?id=${id}`; });

  // FIX Bug 3 : idem pour favBtn
  const favBtn    = el('heroFavBtn');
  const newFavBtn = favBtn.cloneNode(true);
  favBtn.parentNode.replaceChild(newFavBtn, favBtn);
  newFavBtn.dataset.id = id;
  newFavBtn.classList.toggle('active', isFav(id));
  newFavBtn.addEventListener('click', async () => {
    const added = await toggleFav(id, title, img);
    newFavBtn.classList.toggle('active', added);
  });

  // playBtn n'a pas de listener JS, juste un href → pas de fuite
  el('heroPlayBtn').href = `anime.html?id=${id}`;

  skeleton.classList.add('hidden');
  info.classList.remove('hidden');
}

function updateHeroDots() {
  const dotsEl = el('heroDots');
  dotsEl.innerHTML = state.heroAnimes
    .map((_, i) => `<div class="hero-dot ${i === state.heroIndex ? 'active' : ''}" data-i="${i}"></div>`)
    .join('');

  // FIX : délégation sur le conteneur (un seul listener, pas N)
  // + cloneNode pour éviter les doubles listeners sur le conteneur lui-même
  const newDotsEl = dotsEl.cloneNode(true);
  dotsEl.parentNode.replaceChild(newDotsEl, dotsEl);

  newDotsEl.addEventListener('click', (e) => {
    const dot = e.target.closest('.hero-dot');
    if (!dot) return;
    clearInterval(state.heroTimer);
    state.heroIndex = parseInt(dot.dataset.i, 10);
    renderHero(state.heroAnimes[state.heroIndex]);
    updateHeroDots();
    startHeroRotation();
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
  const toggle   = el('searchToggle');
  const expand   = el('searchExpand');
  const input    = el('searchInput');
  const clearBtn = el('searchClear');
  const overlay  = el('searchOverlay');
  const closeBtn = el('searchOverlayClose');

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
  const overlay = el('searchOverlay');
  const grid    = el('searchResultsGrid');
  const loader  = el('searchLoader');
  const empty   = el('searchEmpty');
  const label   = el('searchLabel');

  overlay.classList.add('active');
  grid.innerHTML = '';
  empty.classList.remove('visible');
  loader.classList.add('visible');
  label.textContent = t('search.label', query);

  try {
    const data    = await jikanFetch(`/anime?q=${encodeURIComponent(query)}&limit=20&sfw=true`);
    loader.classList.remove('visible');
    const results = data.data || [];

    if (results.length === 0) {
      empty.classList.add('visible');
      return;
    }
    label.textContent = t('search.count', results.length, query);
    results.forEach(anime => grid.appendChild(buildCard(anime)));

  } catch (e) {
    loader.classList.remove('visible');
    label.textContent = t('search.error');
    console.error(e);
  }
}

/* ──────────────────────────────────────
   FAVORITES SECTION
────────────────────────────────────── */
function renderFavoritesSection() {
  const section  = el('section-favorites');
  const carousel = el('carousel-favorites');
  if (!section || !carousel) return;
  const favs = getFavs();

  if (favs.length === 0) {
    section.style.display = 'none';
    updatePersonalZone();
    return;
  }
  section.style.display = 'block';
  carousel.innerHTML = '';
  favs.forEach(f => {
    const fake = {
      mal_id:        f.id,
      title:         f.title,
      title_english: f.title,
      images:        { jpg: { large_image_url: f.img, image_url: f.img } },
      score:         null,
      type:          null,
    };
    carousel.appendChild(buildCard(fake));
  });
  updatePersonalZone();
}

/* ──────────────────────────────────────
   CONTINUE WATCHING
────────────────────────────────────── */
function renderContinueWatching() {
  // Supporte les deux IDs (zone personnelle ou section standalone)
  const section  = el('section-continue-inner') || el('section-continue');
  const carousel = el('carousel-continue');
  if (!carousel) return;
  const hist = getHistory();

  if (!section || hist.length === 0) {
    if (section) section.style.display = 'none';
    updatePersonalZone();
    return;
  }
  section.style.display = 'block';
  carousel.innerHTML = '';
  hist.slice(0, 10).forEach(h => {
    const fake = {
      mal_id:        h.id,
      title:         h.title,
      title_english: h.title,
      images:        { jpg: { large_image_url: h.img } },
      score:         null,
      type:          null,
    };
    carousel.appendChild(buildCard(fake, { showProgress: true, progress: h.progress || 45 }));
  });
  updatePersonalZone();
}

/* Affichage de la Zone Personnelle */
function updatePersonalZone() {
  const zone  = el('personalZone');
  const empty = el('personalEmpty');
  if (!zone) return;
  const hasFavs = getFavs().length > 0;
  const hasHist = getHistory().length > 0;
  zone.style.display = 'block';
  if (empty) empty.style.display = (hasFavs || hasHist) ? 'none' : 'flex';
}

/* ──────────────────────────────────────
   NAVBAR SCROLL
────────────────────────────────────── */
function initNavbar() {
  const nav = el('navbar');
  if (!nav) return;
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 80);
  }, { passive: true });
}

/* ──────────────────────────────────────
   DATA LOADING
────────────────────────────────────── */
async function loadSection(endpointPath, carouselId, skeletonId, count = 8, opts = {}) {
  const skelEl = el(skeletonId);
  if (skelEl) buildSkeletons(skelEl.parentElement, count);

  try {
    // Plus besoin de opts.delay : la queue jikanFetch gère le séquencement
    const data   = await jikanFetch(endpointPath);
    const animes = data.data || [];
    renderCarousel(carouselId, animes, opts);
  } catch (e) {
    const c = el(`carousel-${carouselId}`);
    if (c) c.innerHTML = `<p style="color:var(--muted);padding:20px;font-size:0.85rem;">${t('section.error')}</p>`;
    console.error(`Section ${carouselId}:`, e);
  }
}

async function loadHero() {
  try {
    const data = await jikanFetch('/top/anime?filter=airing&limit=10');
    state.heroAnimes = (data.data || []).filter(a => a.images?.jpg?.large_image_url);
    if (state.heroAnimes.length === 0) return;
    // Expose pour le bouton Surprise-moi
    window._heroAnimesPool    = state.heroAnimes;
    window._heroCurrentIndex  = 0;
    window._renderHero        = renderHero;
    window._updateHeroDots    = updateHeroDots;
    renderHero(state.heroAnimes[0]);
    updateHeroDots();
    startHeroRotation();
  } catch (e) {
    console.error('Hero load error:', e);
    const sk = el('heroSkeleton');
    if (sk) sk.innerHTML = `<p style="color:var(--muted)">${t('adj.error')}</p>`;
  }
}

/* ──────────────────────────────────────
   MOOD PILLS — endpoints Jikan par ambiance
────────────────────────────────────── */
const MOOD_CONFIG = {
  all:           { label: t('mood.all'),          endpoint: null },
  action:        { label: t('mood.action'), endpoint: '/anime?genres=1&order_by=score&sort=desc&limit=20&sfw=true' },
  romance:       { label: t('mood.romance'),    endpoint: '/anime?genres=22&order_by=score&sort=desc&limit=20&sfw=true' },
  dark:          { label: t('mood.dark'), endpoint: '/anime?genres=8&rating=r&order_by=score&sort=desc&limit=20&sfw=true' },
  comedy:        { label: t('mood.comedy'),   endpoint: '/anime?genres=4&order_by=score&sort=desc&limit=20&sfw=true' },
  scifi:         { label: t('mood.scifi'), endpoint: '/anime?genres=24&order_by=score&sort=desc&limit=20&sfw=true' },
  psychological: { label: t('mood.psychological'),   endpoint: '/anime?genres=40&order_by=score&sort=desc&limit=20&sfw=true' },
  slice:         { label: t('mood.slice'),    endpoint: '/anime?genres=36&order_by=score&sort=desc&limit=20&sfw=true' },
};

function initMoodPills() {
  const row = el('moodRow');
  if (!row) return;

  row.addEventListener('click', async (e) => {
    const pill = e.target.closest('.mood-pill');
    if (!pill) return;

    // Toggle actif
    row.querySelectorAll('.mood-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    const mood    = pill.dataset.mood || 'all';
    const config  = MOOD_CONFIG[mood];
    const section = el('section-mood');
    const titleEl = el('moodSectionTitle');

    // "Tout" → cache la section mood
    if (mood === 'all' || !config?.endpoint) {
      if (section) section.style.display = 'none';
      return;
    }

    // Affiche section + skeleton
    section.style.display = 'block';
    titleEl.innerHTML = `<span class="section-dot violet"></span>${config.label}`;
    const carousel = el('carousel-mood');
    buildSkeletons(carousel, 10);

    // Scroll smooth vers la section (Désactivé suite à demande utilisateur)
    // setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

    try {
      const data   = await jikanFetch(config.endpoint);
      const animes = data.data || [];
      renderCarousel('mood', animes);
    } catch (e) {
      const c = el('carousel-mood');
      if (c) c.innerHTML = `<p style="color:var(--muted);padding:20px;font-size:0.85rem;">${t('common.error_load')}</p>`;
    }
  });
}

/* ──────────────────────────────────────
   RECHERCHE AVANCÉE
────────────────────────────────────── */
function initAdvancedSearch() {
  const toggle  = el('advSearchToggle');
  const body    = el('advSearchBody');
  const arrow   = el('advArrow');
  const btnSearch = el('advBtnSearch');
  const clearBtn  = el('advClearBtn');

  if (!toggle) return;

  // Toggle ouverture
  toggle.addEventListener('click', () => {
    const open = body.style.display === 'none';
    body.style.display  = open ? 'block' : 'none';
    arrow.textContent   = open ? '▲' : '▼';
  });

  // Lancer la recherche
  btnSearch.addEventListener('click', () => runAdvancedSearch());

  // Effacer résultats
  if (clearBtn) clearBtn.addEventListener('click', () => {
    el('section-adv-results').style.display = 'none';
    // Reset selects
    ['advGenre','advType','advScore','advStatus','advYear'].forEach(id => {
      const s = el(id); if (s) s.value = '';
    });
  });
}

async function runAdvancedSearch() {
  const q      = el('searchInput')?.value.trim() || '';
  const genre  = el('advGenre')?.value  || '';
  const type   = el('advType')?.value   || '';
  const score  = el('advScore')?.value  || '';
  const status = el('advStatus')?.value || '';
  const year   = el('advYear')?.value   || '';

  // Build endpoint
  let params = 'limit=20&sfw=true&order_by=score&sort=desc';
  if (q)      params += `&q=${encodeURIComponent(q)}`;  // ← q seulement si non vide
  if (genre)  params += `&genres=${genre}`;
  if (type)   params += `&type=${type}`;
  if (score)  params += `&min_score=${score}`;
  if (status) params += `&status=${status}`;
  if (year)   params += `&start_date=${year}-01-01${year === '2010' ? '&end_date=2019-12-31' : year === '2000' ? '&end_date=2009-12-31' : ''}`;

  const section  = el('section-adv-results');
  const titleEl  = el('advResultsTitle');
  const carousel = el('carousel-adv-results');

  section.style.display = 'block';

  const parts = [];
  if (q)      parts.push(`« ${q} »`);
  if (genre)  parts.push(el('advGenre').options[el('advGenre').selectedIndex].text);
  if (type)   parts.push(el('advType').options[el('advType').selectedIndex].text);
  if (score)  parts.push(`Score ${score}+`);
  if (status) parts.push(el('advStatus').options[el('advStatus').selectedIndex].text);
  if (year)   parts.push(el('advYear').options[el('advYear').selectedIndex].text);
  titleEl.innerHTML = `<span class="section-dot blue"></span>${parts.length ? parts.join(' · ') : t('adv.results', [])}`;

  buildSkeletons(carousel, 10);
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const data   = await jikanFetch(`/anime?${params}`);
    const animes = data.data || [];
    if (animes.length === 0) {
      carousel.innerHTML = `<p style="color:var(--muted);padding:20px;font-size:0.85rem;">${t('adv.no_results')}</p>`;
      return;
    }
    renderCarousel('adv-results', animes);
  } catch (e) {
    carousel.innerHTML = `<p style="color:var(--muted);padding:20px;font-size:0.85rem;">${t('adv.error')}</p>`;
    console.error('Advanced search:', e);
  }
}

/* ──────────────────────────────────────
   TRENDING (Firebase)
────────────────────────────────────── */
async function loadTrending() {
  try {
    const { getTrendingAnime } = await import('./firebase.js');
    const trending = await getTrendingAnime(15, 48); // 48h de fenêtre

    if (!trending || trending.length === 0) return;

    const section = el('section-trending');
    if (!section) return;

    // Récupère les vrais animes depuis Jikan pour avoir les images/titres
    const ids = trending.slice(0, 10).map(t => t.animeId);
    const animes = [];

    for (const id of ids) {
      try {
        const data = await jikanFetch(`/anime/${id}`);
        if (data.data) animes.push(data.data);
      } catch (_) {}
    }

    if (animes.length === 0) return;

    section.style.display = 'block';
    renderCarousel('trending', animes);
  } catch (e) {
    // Firebase ou réseau indispo → on cache silencieusement
    console.warn('Trending load failed:', e);
  }
}

/* ──────────────────────────────────────
   ANIME DU JOUR
   Sélectionne un anime pseudo-aléatoire basé sur la date
   → même anime toute la journée, change à minuit
────────────────────────────────────── */
async function loadAnimeDuJour() {
  try {
    const today  = new Date();
    const seed   = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
    const page   = (seed % 4) + 1;
    const offset = seed % 25;

    const data   = await jikanFetch(`/top/anime?filter=bypopularity&limit=25&page=${page}`);
    const animes = (data.data || []).filter(a => a.images?.jpg?.large_image_url && a.synopsis);
    if (animes.length === 0) return;

    const picked = animes[offset % animes.length];

    // Fetch /full pour récupérer trailer.youtube_id
    const fullData = await jikanFetch(`/anime/${picked.mal_id}/full`);
    const anime    = fullData.data || picked;

    renderAnimeDuJour(anime);

    el('adjShuffle')?.addEventListener('click', async () => {
      const random   = animes[Math.floor(Math.random() * animes.length)];
      const rFull    = await jikanFetch(`/anime/${random.mal_id}/full`);
      renderAnimeDuJour(rFull.data || random, true);
    });
  } catch (e) {
    console.warn('Anime du jour:', e);
  }
}

function renderAnimeDuJour(anime, shuffle = false) {
  const section     = el('animeDuJour');
  const iframe      = el('adjIframe');
  const imgFallback = el('adjImgFallback');
  const titleEl     = el('adjTitle');
  const synEl       = el('adjSynopsis');
  const badgesEl    = el('adjBadges');
  const linkEl      = el('adjLink');

  if (!section) return;

  const title     = anime.title_english || anime.title;
  const img       = anime.images?.jpg?.large_image_url || '';
  const synopsis  = (anime.synopsis || '').replace(/\[Written by MAL Rewrite\]/gi, '').trim();
  const youtubeId = anime.trailer?.youtube_id || null;

  if (shuffle) {
    section.style.opacity = '0';
    setTimeout(() => { section.style.opacity = '1'; }, 300);
  }

  titleEl.textContent = title;
  synEl.textContent   = synopsis.slice(0, 180) + (synopsis.length > 180 ? '…' : '');
  linkEl.href         = `anime.html?id=${anime.mal_id}`;

  if (youtubeId) {
    // YouTube autoplay mute — on cache l'image
    iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${youtubeId}&modestbranding=1&rel=0&playsinline=1`;
    iframe.style.display = 'block';
    imgFallback.style.display = 'none';
    // Si l'iframe échoue (bloqué), on affiche l'image
    iframe.onerror = () => {
      iframe.style.display = 'none';
      imgFallback.src = img;
      imgFallback.style.display = 'block';
    };
  } else {
    // Pas de trailer → image de couverture en fond
    iframe.style.display = 'none';
    iframe.src = '';
    imgFallback.src = img;
    imgFallback.style.display = 'block';
  }

  const badges = [];
  if (anime.score) badges.push(`<span class="badge badge-gold">★ ${anime.score.toFixed(1)}</span>`);
  if (anime.type) {
    const tMap = { TV:t('type.tv'), Movie:"Film d'anime", OVA:t('type.ova'), ONA:t('type.ona'), Special:t('type.special') };
    badges.push(`<span class="badge badge-muted">${tMap[anime.type] || anime.type}</span>`);
  }
  badgesEl.innerHTML = badges.join('');

  section.style.display = 'block';
  section.style.transition = 'opacity 0.4s ease';
}
/* ──────────────────────────────────────
   POUR TOI — Recommandations basées sur l'historique
────────────────────────────────────── */
async function loadForYou() {
  const section = el('section-for-you');
  if (!section) return;

  const history   = getHistory();
  const favs      = getFavs();
  try { var watchList = JSON.parse(localStorage.getItem('VoirAnime_watchStatus') || '{}'); }
  catch { var watchList = {}; }
  const watchArr  = Object.values(watchList);

  // Déclencher dès qu'il y a 1 favori, 1 statut watchlist, ou 1 historique
  const hasData = history.length > 0 || favs.length > 0 || watchArr.length > 0;
  if (!hasData) return;

  // ── Recommandations genres ──
  const genreCount = {};

  history.slice(0, 10).forEach(h => {
    (h.genres || []).forEach(gid => {
      genreCount[gid] = (genreCount[gid] || 0) + 1;
    });
  });

  // Compléter avec les genres des favs si historique insuffisant
  if (Object.keys(genreCount).length === 0) {
    favs.slice(0, 10).forEach(f => {
      (f.genres || []).forEach(gid => {
        genreCount[gid] = (genreCount[gid] || 0) + 1;
      });
    });
  }

  // Si aucun genre trouvé → fallback top animes
  let candidates = [];
  let usedFallback = false;

  if (Object.keys(genreCount).length === 0) {
    usedFallback = true;
    try {
      const d = await jikanFetch(`/top/anime?order_by=score&sort=desc&limit=25&sfw=true`);
      candidates = d.data || [];
    } catch { return; }
  } else {
    // Top 2 genres les plus vus
    const topGenres = Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);

    const genreParam = topGenres.join(',');
    try {
      const d = await jikanFetch(`/anime?genres=${genreParam}&order_by=score&sort=desc&limit=25&sfw=true`);
      candidates = d.data || [];
    } catch { return; }
  }

  // Filtre les animes déjà vus
  const seenIds  = new Set(history.map(h => String(h.id)));
  const seenType = history.length > 0 ? history[0].type || null : null;

  // Score de pertinence
  function scoreAnime(anime) {
    let score = 0;
    // Genres en commun
    (anime.genres || []).forEach(g => {
      if (genreCount[g.mal_id]) score += genreCount[g.mal_id] * 3;
    });
    // Même type
    if (seenType && anime.type === seenType) score += 2;
    // Popularité (membres)
    if (anime.members) score += Math.log10(anime.members);
    return score;
  }

  const results = candidates
    .filter(a => !seenIds.has(String(a.mal_id)))
    .map(a => ({ ...a, _score: scoreAnime(a) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 12);

  if (results.length === 0) return;

  section.style.display = '';
  const badge = el('forYouBadge');
  if (badge) badge.textContent = usedFallback
    ? t('alert.badge_fallback')
    : t('alert.badge_based', Math.min(history.length + favs.length, 5));

  const carousel = el('carousel-for-you');
  carousel.innerHTML = '';
  results.forEach(anime => carousel.appendChild(buildCard(anime)));
}

async function init() {
  initNavbar();
  initSearch();
  initCarouselButtons();
  initMoodPills();
  initAdvancedSearch();
  updateFavUI();
  renderFavoritesSection();
  // renderContinueWatching() — supprimé, géré dans le profil

  // Hero supprimé — remplacé par Anime du jour
  loadAnimeDuJour();
  loadForYou();

  await loadSection('/top/anime?filter=bypopularity&limit=20', 'popular', 'skel-popular', 10, { showRank: true });
  await loadSection('/top/anime?limit=20', 'top', 'skel-top', 10);
  await loadSection('/top/anime?filter=airing&limit=20', 'airing', 'skel-airing', 10);
  await loadSection('/top/anime?type=movie&limit=20', 'movies', 'skel-movies', 10);
  await loadSection('/top/anime?type=tv&limit=20', 'series', 'skel-series', 10);
  await loadSection('/top/anime?type=ova&limit=20', 'ova', 'skel-ova', 10);
  await loadSection('/top/anime?type=ona&limit=20', 'ona', 'skel-ona', 10);

  // Trending Firebase — chargé en dernier, non bloquant
  loadTrending();

  // ===============================
  // FORM CONTACT (IMPORTANT FIX)
  // ===============================
  const lang = document.getElementById("fcf_lang");
  const url = document.getElementById("fcf_url");

  if (lang) lang.value = navigator.language;
  if (url) url.value = window.location.href;
}


// ===============================
// Language Dropdown
// ===============================
const langBtn = document.getElementById("langBtn");
const dropdown = document.getElementById("langDropdown");
const overlay = document.getElementById("langOverlay");

if (langBtn && dropdown && overlay) {
  langBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const isOpen = dropdown.classList.toggle("open");
    overlay.style.display = isOpen ? "block" : "none";
  });

  overlay.addEventListener("click", () => {
    dropdown.classList.remove("open");
    overlay.style.display = "none";
  });
}


// IMPORTANT : une seule entrée init
document.addEventListener('DOMContentLoaded', init);
