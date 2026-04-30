/* ═══════════════════════════════════════════════════
   anime.js — VoirAnime Detail Page
   Gère : Détails anime · Trailer YouTube · Favoris · Recommandations
   ═══════════════════════════════════════════════════ */
import { trackView, trackClick } from './firebase.js';
import { buildFranchise } from './animeFranchise.js';

const API = 'https://api.jikan.moe/v4';

/* ──────────────────────────────────────
   UTILS
────────────────────────────────────── */
function el(id) { return document.getElementById(id); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const JIKAN_MIN_INTERVAL = 800; // ms minimum entre deux requêtes (ralenti)
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes de cache

let _lastRequestTime = 0;
let _queue = Promise.resolve();

async function jikanFetch(endpoint, retries = 3) {
  const cacheKey = `jikan_cache_${endpoint}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL_MS) return data;
      sessionStorage.removeItem(cacheKey);
    }
  } catch (_) {}

  const result = await (_queue = _queue.then(() => _executeRequest(endpoint, retries, cacheKey)));
  return result;
}

async function _executeRequest(endpoint, retries, cacheKey) {
  const now = Date.now();
  const elapsed = now - _lastRequestTime;
  if (elapsed < JIKAN_MIN_INTERVAL) await sleep(JIKAN_MIN_INTERVAL - elapsed);

  for (let i = 0; i < retries; i++) {
    try {
      _lastRequestTime = Date.now();
      const targetPath = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
      const res = await fetch(`${API}${targetPath}`);
      
      if (res.status === 429) {
        await res.text().catch(() => {});
        const wait = 2000 * (i + 1);
        console.warn(`[Jikan] 429 sur ${endpoint} — retry dans ${wait}ms`);
        await sleep(wait);
        _lastRequestTime = Date.now();
        continue;
      }
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
      } catch (_) {}
      
      return data;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(800 * (i + 1));
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
  try { return JSON.parse(localStorage.getItem('VoirAnime_favs') || '[]'); } catch { return []; }
}
function saveFavs(f) { localStorage.setItem('VoirAnime_favs', JSON.stringify(f)); }
function isFav(id) { return getFavs().some(f => f.id === id); }

async function toggleFav(id, title, img) {
  const favs   = getFavs();
  const idx    = favs.findIndex(f => f.id === id);
  const adding = idx === -1;
  const piUser = window.piAuth?.getUser?.() || (() => {
    try { return JSON.parse(localStorage.getItem('pi_user')); } catch { return null; }
  })();

  // ── Suppression ──────────────────────────────────────────────────────────
  if (!adding) {
    favs.splice(idx, 1);
    saveFavs(favs);
    showToast(t('anime.fav_removed', title));
    if (piUser?.uid) {
      fetch('/api/favorites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'remove', piUserId: piUser.uid, animeId: id }),
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
        body:    JSON.stringify({ action: 'add', piUserId: piUser.uid, animeId: id, title, img }),
      });
      const data = await res.json();

      if (res.status === 403 && data.error === 'LIMIT_REACHED') {
        showFavLimitModal(data.count, data.limit);
        return false;
      }
      if (!res.ok) { showToast('⚠️ Server error'); return false; }

    } catch {
      if (favs.length >= 20) { showFavLimitModal(favs.length, 20); return false; }
    }
  } else {
    if (favs.length >= 20) { showFavLimitModal(favs.length, 20); return false; }
  }

  favs.unshift({ id, title, img });
  saveFavs(favs);
  showToast(t('anime.fav_added', title));
  return true;
}

/* ── Modal limite favoris Free ──────────────────────────────────────────── */
function showFavLimitModal(count, limit) {
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

/* ── History ── */
function addToHistory(id, title, img, progress = 0, genres = []) {
  try {
    const hist = JSON.parse(localStorage.getItem('VoirAnime_history') || '[]').filter(h => h.id !== id);
    hist.unshift({ id, title, img, progress, genres, ts: Date.now() });
    localStorage.setItem('VoirAnime_history', JSON.stringify(hist.slice(0, 20)));
  } catch {}
}

/* ──────────────────────────────────────
   CARD BUILDER (for recommendations)
────────────────────────────────────── */
/* ──────────────────────────────────────
   FRANCHISE CARD — avec numéro de saison + année
────────────────────────────────────── */
function buildFranchiseCard(anime, isCurrent = false, seasonNum = null) {
  const id    = anime.mal_id;
  const title = anime.title_english || anime.title || t('anime.unknown_title');
  const img   = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score = anime.score;
  const type  = anime.type || '';
  const fav   = isFav(id);

  // Année de sortie
  const year = anime.aired?.from ? new Date(anime.aired.from).getFullYear() : null;

  // Label affiché sous le titre
  const seasonLabel = seasonNum ? `Saison ${seasonNum}` : null;
  const subParts = [
    seasonLabel,
    year ? String(year) : null,
    score ? `★ ${score.toFixed(1)}` : null,
  ].filter(Boolean);

  const card = document.createElement('article');
  card.className = 'anime-card' + (isCurrent ? ' franchise-current' : '');

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
      ${seasonNum ? `<span class="card-type-badge">S${seasonNum}</span>` : (type ? `<span class="card-type-badge">${({TV:'Série',Movie:'Film',OVA:'OVA',ONA:'Streaming',Special:'Spécial'}[type]||type)}</span>` : '')}
      <button class="card-fav-btn ${fav ? 'active' : ''}" data-fav-id="${id}" aria-label="Favori">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
      </button>
    </div>
    <div class="card-info">
      <h3 class="card-title">${title}</h3>
      <p class="card-sub">${subParts.join(' · ')}</p>
    </div>
  `;

  card.addEventListener('click', (e) => {
    if (e.target.closest('.card-fav-btn')) return;
    addToHistory(id, title, img);
    window.location.href = `anime.html?id=${id}`;
  });

  card.querySelector('.card-fav-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const added = await toggleFav(id, title, img);
    const btn = e.currentTarget;
    btn.classList.toggle('active', added);
    btn.querySelector('svg').setAttribute('fill', added ? 'currentColor' : 'none');
  });

  return card;
}

function buildRecoCard(anime, isCurrent = false) {
  const id    = anime.mal_id;
  const title = anime.title_english || anime.title || 'Titre inconnu';
  const img   = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const score = anime.score;
  const type  = anime.type || '';
  const fav   = isFav(id);

  const card = document.createElement('article');
  card.className = 'anime-card' + (isCurrent ? ' franchise-current' : '');

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
      ${type ? `<span class="card-type-badge">${({TV:'Série',Movie:"Film",OVA:'Spécial',ONA:'Streaming',Special:'Spécial'}[type]||type)}</span>` : ''}
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

  card.querySelector('.card-fav-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const added = await toggleFav(id, title, img);
    const btn = e.currentTarget;
    btn.classList.toggle('active', added);
    btn.querySelector('svg').setAttribute('fill', added ? 'currentColor' : 'none');
  });

  return card;
}

/* ──────────────────────────────────────
   YOUTUBE API — Clé à remplacer sur GitHub
────────────────────────────────────── */
/* ──────────────────────────────────────
   YOUTUBE — Proxy via /api/youtube (Vercel)
   La clé API est côté serveur, jamais exposée au client
────────────────────────────────────── */

function ytCacheGet(key) {
  try { const c = sessionStorage.getItem(`yt_${key}`); return c ? JSON.parse(c) : null; } catch { return null; }
}
function ytCacheSet(key, value) {
  try { sessionStorage.setItem(`yt_${key}`, JSON.stringify(value)); } catch {}
}

async function findYouTubeId(title) {
  if (!title) return null;
  const cacheKey = `search_${encodeURIComponent(title)}`;
  const cached   = ytCacheGet(cacheKey);
  if (cached !== null) return cached;

  try {
    const controller = new AbortController();
    const timeout    = setTimeout(() => controller.abort(), 8000); // timeout 8s
    const res  = await fetch(`/api/youtube?title=${encodeURIComponent(title)}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.status === 404) { ytCacheSet(cacheKey, null); return null; }
    if (!res.ok) { console.warn('[YT] API error:', res.status); return null; }

    const data = await res.json();
    const id   = data.videoId || null;
    ytCacheSet(cacheKey, id);
    return id;
  } catch (e) {
    // Timeout ou réseau — ne pas afficher "aucune vidéo" pour autant
    console.warn('[YT] Fetch error:', e.message);
    return null;
  }
}

/* ──────────────────────────────────────
   TRAILER LOGIC — Autoplay + fallback
────────────────────────────────────── */
const trailerState = { youtubeId: null, playing: false, muted: true };

function embedTrailer(youtubeId, autoplay = true) {
  trailerState.youtubeId = youtubeId;
  const playBtn   = el('playTrailerBtn');
  const unmuteBtn = el('unmuteBtn');

  if (autoplay) {
    startTrailer(youtubeId);
  } else {
    if (playBtn) {
      playBtn.classList.remove('hidden');
      playBtn.addEventListener('click', () => {
        if (!trailerState.playing) startTrailer(youtubeId);
      }, { once: true });
    }
  }
  if (unmuteBtn) unmuteBtn.addEventListener('click', toggleMute);
}

function startTrailer(youtubeId) {
  const container = el('trailerContainer');
  const banner    = el('animeBanner');
  const frame     = el('trailerFrame');
  const playBtn   = el('playTrailerBtn');
  const unmuteBtn = el('unmuteBtn');

  frame.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&enablejsapi=1&playsinline=1`;

  if (container) container.classList.add('active');
  if (banner)    { banner.style.opacity = '0'; banner.style.transition = 'opacity 0.8s ease'; }
  if (playBtn)   playBtn.classList.add('hidden');
  if (unmuteBtn) unmuteBtn.classList.remove('hidden');

  trailerState.playing = true;
  trailerState.muted   = true;
  const muteLabel = el('muteLabel');
  const muteIcon  = el('muteIcon');
  if (muteLabel) muteLabel.textContent = t('anime.sound_on');
  if (muteIcon)  muteIcon.innerHTML    = mutedSVG();
}

/* Détection mobile/Pi Browser — utilisé pour adapter le comportement */
const isMobileOrPi = /Android|iPhone|iPad|iPod|Pi Browser|PiBrowser/i.test(navigator.userAgent)
  || ('ontouchstart' in window)
  || (navigator.maxTouchPoints > 0);

function toggleMute() {
  const frame = el('trailerFrame');
  if (!frame || !trailerState.youtubeId) return;

  trailerState.muted = !trailerState.muted;

  if (isMobileOrPi) {
    // Sur mobile/Pi Browser : postMessage et reload src cassent tous les deux la vidéo
    // Solution : passer en mode contrôles YouTube natifs (l'utilisateur contrôle le son lui-même)
    activateNativeControls();
  } else {
    // Desktop : postMessage fonctionne sans interruption
    try {
      const command = trailerState.muted ? 'mute' : 'unMute';
      frame.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func: command, args: [] }),
        '*'
      );
    } catch(e) {
      activateNativeControls();
    }
  }

  const muteLabel = el('muteLabel');
  const muteIcon  = el('muteIcon');
  if (muteLabel) muteLabel.textContent = trailerState.muted ? t('anime.sound_on') : t('anime.sound_off');
  if (muteIcon)  muteIcon.innerHTML    = trailerState.muted ? mutedSVG() : unmutedSVG();
}

/* Active les contrôles YouTube natifs dans l'iframe — sans recharger la vidéo */
function activateNativeControls() {
  const frame     = el('trailerFrame');
  const youtubeId = trailerState.youtubeId;
  if (!frame || !youtubeId || trailerState._nativeControls) return;
  trailerState._nativeControls = true;

  // Remplacer controls=0 par controls=1 en gardant la position de lecture
  // YouTube reprend automatiquement là où il en était si enablejsapi=1
  frame.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&enablejsapi=1&playsinline=1`;

  // Masquer nos boutons custom — l'utilisateur utilise les contrôles YouTube
  const unmuteBtn = el('unmuteBtn');
  if (unmuteBtn) unmuteBtn.classList.add('hidden');

  // Rendre l'iframe cliquable pour les contrôles natifs
  if (frame) frame.style.pointerEvents = 'auto';
}

function mutedSVG() {
  return `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`;
}
function unmutedSVG() {
  return `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`;
}

function showNoVideo() {
  // Affichage propre quand aucune vidéo n'est disponible
  const playBtn = el('playTrailerBtn');
  const banner  = el('animeBanner');
  if (playBtn) {
    playBtn.style.opacity = '0.4';
    playBtn.disabled      = true;
    playBtn.innerHTML     = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="16"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
      </svg>
      ${t('anime.no_video_avail')}`;
  }
  // Bannière reste visible, légèrement assombrie pour indiquer l'absence de vidéo
  if (banner) banner.style.filter = 'brightness(0.7)';
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

      carousel.style.scrollSnapType = 'none';
      const firstCard = carousel.querySelector('.anime-card');
      const cardWidth = firstCard ? (firstCard.offsetWidth + 14) : 172;
      const step      = cardWidth * 3;
      carousel.scrollBy({ left: btn.classList.contains('prev') ? -step : step, behavior: 'smooth' });

      clearTimeout(btn._snapTimer);
      btn._snapTimer = setTimeout(() => { carousel.style.scrollSnapType = ''; }, 400);
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
  const synopsis = (anime.synopsis || t('anime.no_synopsis'))
                   .replace(/\[Written by MAL Rewrite\]/gi, '').trim();

  // Page title
  document.title = `VoirAnime — ${title}`;

  // Banner
  el('bannerImg').src = img;
  el('bannerImg').alt = title;
  el('bannerImg').onerror = () => {
    el('bannerImg').src = 'https://placehold.co/1200x600/111118/555?text=No+Image';
  };

  // ── Trailer : Jikan en priorité → YouTube API en fallback ──
  const jikanTrailerId = anime.trailer?.youtube_id;
  if (jikanTrailerId) {
    // Jikan a un ID → on l'utilise directement, zéro quota YT consommé
    embedTrailer(jikanTrailerId, true);
    const ratingEl = el('trailerRating');
    if (ratingEl) ratingEl.textContent = anime.rating ? anime.rating.split(' ')[0] : '';
  } else {
    // Pas d'ID Jikan → on cherche sur YouTube (consomme ~100 unités/recherche)
    const playBtn = el('playTrailerBtn');

    if (isMobileOrPi) {
      // Sur mobile/Pi sans ID Jikan : masquer le bouton play (le lien est dans les stats)
      if (playBtn) playBtn.classList.add('hidden');
    } else {
      // Desktop : appel API YouTube normal
      if (playBtn) {
        playBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               style="animation:spin 1s linear infinite">
            <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/>
          </svg>
          Recherche vidéo…`;
        playBtn.style.opacity = '0.7';
        playBtn.disabled      = true;
      }

      findYouTubeId(title).then(ytId => {
        if (ytId) {
          embedTrailer(ytId, true);
                const ratingEl = el('trailerRating');
          if (ratingEl) ratingEl.textContent = 'YouTube';
        } else {
          showNoVideo();
        }
      });
    }
  }

  // ── Badge épisode — uniquement si statut STRICTEMENT "Currently Airing" ──
  // Jikan retourne : "Currently Airing" | "Finished Airing" | "Not yet aired"
  // On n'affiche jamais de badge épisode si l'anime est terminé ou à venir.
  const STATUS_AIRING   = 'Currently Airing';
  const STATUS_FINISHED = 'Finished Airing';
  const STATUS_UPCOMING = 'Not yet aired';

  const isStrictlyAiring  = anime.status === STATUS_AIRING;
  const isFinished        = anime.status === STATUS_FINISHED || anime.status?.includes('Finished');
  const isUpcoming        = anime.status === STATUS_UPCOMING;

  const epBadge = el('episodeBadge');
  if (epBadge) epBadge.style.display = 'none'; // masqué par défaut

  if (isStrictlyAiring && anime.broadcast?.day && !isFinished) {
    // Vérifie qu'on a bien un jour de broadcast valide
    const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const daysFR = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const today  = new Date().getDay();
    const epIdx  = days.findIndex(d =>
      anime.broadcast.day.toLowerCase().startsWith(d.toLowerCase())
    );

    if (epIdx >= 0 && epBadge) {
      const diff = ((epIdx - today) + 7) % 7;
      let label = '', cls = '';

      if      (diff === 0) { label = '🆕 Nouvel épisode aujourd\'hui';  cls = 'badge badge-green episode-badge'; }
      else if (diff === 1) { label = '⏰ Épisode demain';               cls = 'badge badge-gold episode-badge'; }
      else if (diff <= 3)  { label = `⏰ Épisode ${daysFR[epIdx]}`;    cls = 'badge badge-muted episode-badge'; }
      // diff > 3 → pas de badge, trop loin dans la semaine

      if (label) {
        epBadge.textContent = label;
        epBadge.className   = cls;
        epBadge.style.display = 'inline-flex';
      }
    }
  }
  // Garantie absolue : jamais de badge épisode sur un anime terminé
  if (isFinished && epBadge) epBadge.style.display = 'none';

  // Badges
  const badges = [];
  if (anime.score) badges.push(`<span class="badge badge-gold">★ ${anime.score.toFixed(1)}</span>`);
  if (anime.type) {
    const typeMap = { TV:'Série', Movie:"Film d'anime", OVA:'Spécial', ONA:'Streaming', Special:'Spécial' };
    badges.push(`<span class="badge badge-muted" title="${anime.type}">${typeMap[anime.type]||anime.type}</span>`);
  }
  if (isStrictlyAiring) badges.push('<span class="badge badge-green">● En cours</span>');
  else if (isUpcoming)  badges.push('<span class="badge badge-blue">À venir</span>');
  // isFinished → pas de badge statut (info déjà dans le tableau)
  if (anime.rating) {
    const rMap = {'R':'18+','R+':'18+','Rx':'18+','PG-13':'13+','PG':'Enfants','G':'Tout public'};
    const rCode = anime.rating.split(' ')[0];
    badges.push(`<span class="badge badge-muted" title="${anime.rating}">${rMap[rCode]||rCode}</span>`);
  }
  el('animeBadges').innerHTML = badges.join('');

  // Title
  el('animeTitle').textContent   = title;
  el('animeTitleJp').textContent = titleJp;

  // Quick stats
  const stats = [
    anime.episodes ? { val: anime.episodes, label: t('anime.episodes_label') } : null,
    anime.year     ? { val: anime.year, label: 'Année' }                        : null,
  ].filter(Boolean);

  const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' trailer anime')}`;

  const ytBtnHtml = isMobileOrPi ? `
    <a href="${ytSearchUrl}" target="_blank" rel="noopener" class="stat-yt-btn">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23 7s-.3-2-1.2-2.8c-1.1-1.2-2.4-1.2-3-1.3C16.1 2.8 12 2.8 12 2.8s-4.1 0-6.8.2c-.6.1-1.9.1-3 1.3C1.3 5 1 7 1 7S.7 9.2.7 11.3v2c0 2.1.3 4.3.3 4.3s.3 2 1.2 2.8c1.1 1.2 2.6 1.1 3.3 1.2C7.5 21.8 12 22 12 22s4.1 0 6.8-.4c.6-.1 1.9-.1 3-1.3.9-.8 1.2-2.8 1.2-2.8s.3-2.2.3-4.3v-2C23.3 9.2 23 7 23 7zM9.7 15.5V8.4l8.1 3.6-8.1 3.5z"/>
      </svg>
      Voir bande annonce
    </a>` : '';

  el('animeQuickStats').innerHTML = stats.map(s => `
    <div class="stat-item">
      <div class="stat-value">${s.val}</div>
      <div class="stat-label">${s.label}</div>
    </div>
  `).join('') + ytBtnHtml;

  // Watch buttons
  const titleEnc   = encodeURIComponent(title);
  const crunchyUrl = `https://www.crunchyroll.com/search?q=${titleEnc}`;
  const netflixUrl = `https://www.netflix.com/search?q=${titleEnc}`;
  const adnUrl     = `https://animedigitalnetwork.fr/video/search?q=${titleEnc}`;
  function bindStream(elemId, platform, url) {
    const btn = el(elemId); if (!btn) return;
    btn.href = url;
    btn.addEventListener('click', (e) => { e.preventDefault(); trackClick(platform, id); window.open(url, '_blank'); });
  }
  bindStream('streamCrunchyroll','crunchyroll', crunchyUrl);
  bindStream('streamNetflix',    'netflix',     netflixUrl);
  bindStream('streamADN',        'adn',         adnUrl);

  // ── Point 7 : Favori — 1 seul toggle, pas de texte ──
  const favBtns = [el('animeFavBtn'), el('navFavBtn')].filter(Boolean);
  const fav = isFav(id);
  favBtns.forEach(btn => {
    btn.dataset.id = id;
    btn.classList.toggle('active', fav);
    const svg = btn.querySelector('svg');
    if (svg) { svg.setAttribute('fill', fav ? 'currentColor':'none'); svg.setAttribute('stroke', fav ? 'var(--pink)':'currentColor'); }
    const lbl = btn.querySelector('#favBtnLabel, .fav-btn-text');
    if (lbl) lbl.style.display = 'none';
    btn.addEventListener('click', async () => {
      const added = await toggleFav(id, title, img);
      favBtns.forEach(b => {
        b.classList.toggle('active', added);
        const s = b.querySelector('svg');
        if (s) { s.setAttribute('fill', added ? 'currentColor':'none'); s.setAttribute('stroke', added ? 'var(--pink)':'currentColor'); }
      });
    });
  });

  // Synopsis + expand
  const synEl = el('animeSynopsis');
  synEl.textContent = synopsis;
  const toggleEl = el('synopsisToggle');
  let expanded = false;
  toggleEl.addEventListener('click', () => {
    expanded = !expanded;
    synEl.classList.toggle('expanded', expanded);
    toggleEl.textContent = expanded ? t('anime.read_less') : t('anime.read_more');
  });

  // ── Point 8 : Bouton "Voir en français" ──
  const translateBtn = el('synopsisTranslate');
  if (translateBtn) {
    let translated = false, cachedFR = null;
    translateBtn.addEventListener('click', async () => {
      if (translated) {
        synEl.textContent        = synopsis;
        translateBtn.textContent = t('anime.translate_fr');
        translated               = false;
        return;
      }
      if (cachedFR) {
        synEl.textContent        = cachedFR;
        translateBtn.textContent = t('anime.translate_orig');
        translated               = true;
        return;
      }
      translateBtn.textContent = t('anime.translate_ing');
      translateBtn.disabled    = true;
      try {
        const res  = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(synopsis.slice(0,500))}&langpair=en|fr`);
        const data = await res.json();
        cachedFR   = data.responseData?.translatedText || synopsis;
        synEl.textContent        = cachedFR;
        translateBtn.textContent = '↩ Version originale';
        translated               = true;
      } catch (_) {
        translateBtn.textContent = '🇫🇷 Voir en français';
        showToast(t('anime.translate_err'));
      } finally {
        translateBtn.disabled = false;
      }
    });
  }

  // Genres
  const genres = [...(anime.genres||[]),...(anime.themes||[]),...(anime.demographics||[])];
  el('animeGenres').innerHTML = genres.length
    ? genres.map(g => `<span class="tag">${g.name}</span>`).join('')
    : '<span class="tag">Non renseigné</span>';

  // Score widget
  if (anime.score) {
    el('scoreValue').textContent  = anime.score.toFixed(1);
    el('scoreVoters').textContent = anime.scored_by ? t('anime.votes', fmtNum(anime.scored_by)) : '';
    el('scoreRank').textContent   = anime.rank ? t('anime.rank', anime.rank) : '';
  }

  // Info table
  const tMap2 = { TV:'Série', Movie:"Film d'anime", OVA:'Spécial', ONA:'Streaming', Special:'Spécial', Music:'Clip musical' };
  const rows = [
    { k:t('anime.info_title_jp'),   v: titleJp||'—' },
    { k:t('anime.info_type'),       v: tMap2[anime.type]||anime.type||'—' },
    { k:t('anime.info_episodes'),   v: anime.episodes ? `${anime.episodes}`:'—' },
    { k:t('anime.info_duration'),      v: anime.duration||'—' },
    { k:t('anime.info_status'), v: isStrictlyAiring ? t('anime.status_airing') : isFinished ? t('anime.status_finished') : isUpcoming ? t('anime.status_upcoming') : anime.status || '—' },
    { k:t('anime.info_aired'),  v: anime.aired?.string||'—' },
    { k:t('anime.info_studio'),     v: (anime.studios||[]).map(s=>s.name).join(', ')||'—' },
    { k:t('anime.info_source'),     v: anime.source||'—' },
    { k:t('anime.info_season'),     v: anime.season ? `${cap(anime.season)} ${anime.year}`:'—' },
    { k:t('anime.info_popularity'), v: anime.popularity ? `#${anime.popularity}`:'—' },
  ];
  el('infoTable').innerHTML = rows.map(r => `
    <div class="info-row">
      <span class="info-key">${r.k}</span>
      <span class="info-val">${r.v}</span>
    </div>
  `).join('');

  // Stocke les genres pour les recommandations "Pour toi" (évite des appels API supplémentaires)
  const genreIds = (anime.genres || []).map(g => g.mal_id);
  addToHistory(id, title, img, 0, genreIds);
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
   FRANCHISE
────────────────────────────────────── */
async function loadFranchise(animeId) {
  const section = el('franchiseSection');
  if (!section) return;

  // Skeleton loader immédiat
  section.style.display = '';
  const container = el('franchiseContainer');
  container.innerHTML = `
    <div class="content-section">
      <div class="section-header">
        <h2 class="section-title">
          <span class="section-dot violet"></span>${t('anime.franchise')}
        </h2>
      </div>
      <div style="padding:16px;color:var(--muted);font-size:0.85rem;display:flex;align-items:center;gap:10px">
        <div class="sk-dots"><span></span><span></span><span></span></div>
        ${t('anime.franchise_loading')}
      </div>
    </div>`;

  try {
    const franchise = await buildFranchise(animeId);

    const categories = [
      { key: 'seasons', label: t('anime.franchise_seasons'),   dot: 'violet' },
      { key: 'movies',  label: t('anime.franchise_movies'),      dot: 'blue'   },
      { key: 'ova',     label: '📼 OVA',        dot: 'gold'   },
      { key: 'special', label: '⭐ Spéciaux',   dot: 'orange' },
      { key: 'spinOff', label: t('anime.franchise_spinoff'),  dot: 'pink'   },
    ];

    const hasContent = categories.some(c => franchise[c.key].length > 0);
    if (!hasContent) {
      section.style.display = 'none';
      return;
    }

    container.innerHTML = '';

    categories.forEach(({ key, label, dot }) => {
      const items = franchise[key];
      if (items.length === 0) return;

      const block = document.createElement('div');
      block.className = 'content-section';
      block.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">
            <span class="section-dot ${dot}"></span>${label}
          </h2>
        </div>
        <div class="carousel-wrapper">
          <button class="carousel-btn prev" data-carousel="franchise-${key}">‹</button>
          <div class="carousel" id="carousel-franchise-${key}"></div>
          <button class="carousel-btn next" data-carousel="franchise-${key}">›</button>
        </div>`;
      container.appendChild(block);

      const carousel = document.getElementById(`carousel-franchise-${key}`);
      items.forEach((anime, index) => {
        const isCurrent = anime.mal_id === animeId;
        const seasonNum = key === 'seasons' ? index + 1 : null;
        carousel.appendChild(buildFranchiseCard(anime, isCurrent, seasonNum));
      });
    });

    // Bind carousel buttons
    container.querySelectorAll('.carousel-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id  = btn.dataset.carousel;
        const car = document.getElementById(`carousel-${id}`);
        if (!car) return;
        car.scrollBy({ left: btn.classList.contains('prev') ? -800 : 800, behavior: 'smooth' });
      });
    });

  } catch (e) {
    console.warn('[Franchise] Erreur:', e);
  }
}

/* ──────────────────────────────────────
   RECOMMENDATIONS
────────────────────────────────────── */
async function loadRecommendations(id, currentAnime) {
  const carousel = el('carousel-reco');
  carousel.innerHTML = `<p style="color:var(--muted);padding:16px;font-size:0.85rem;">${t('anime.reco_loading')}</p>`;

  try {
    await sleep(600);
    const data = await jikanFetch(`/anime/${id}/recommendations`);
    const items = (data.data || []).slice(0, 20);

    carousel.innerHTML = '';
    if (items.length === 0) {
      carousel.innerHTML = `<p style="color:var(--muted);padding:16px;font-size:0.85rem;">${t('anime.no_reco')}</p>`;
      return;
    }

    // Score de pertinence basé sur genres + type de l'anime courant
    const currentGenreIds = new Set((currentAnime?.genres || []).map(g => g.mal_id));
    const currentType     = currentAnime?.type || null;

    function scoreItem(entry) {
      let score = (entry.votes || 0) * 0.5; // votes Jikan
      (entry.genres || []).forEach(g => { if (currentGenreIds.has(g.mal_id)) score += 4; });
      if (currentType && entry.type === currentType) score += 2;
      if (entry.score) score += entry.score;
      if (entry.members) score += Math.log10(entry.members || 1);
      return score;
    }

    const sorted = items
      .map(item => ({ ...item.entry, _score: scoreItem(item.entry) }))
      .sort((a, b) => b._score - a._score)
      .slice(0, 12);

    sorted.forEach(anime => {
      carousel.appendChild(buildRecoCard({
        mal_id:        anime.mal_id,
        title:         anime.title,
        title_english: anime.title,
        images:        anime.images,
        score:         anime.score || null,
        type:          anime.type  || null,
      }));
    });
  } catch (e) {
    carousel.innerHTML = `<p style="color:var(--muted);padding:16px;font-size:0.85rem;">${t('anime.reco_error')}</p>`;
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
   NOTATION PERSONNELLE (1–10 étoiles)
────────────────────────────────────── */
function getRatings() {
  try { return JSON.parse(localStorage.getItem('VoirAnime_ratings') || '{}'); }
  catch { return {}; }
}
function saveRating(animeId, value) {
  const r = getRatings();
  if (value === null) delete r[String(animeId)];
  else r[String(animeId)] = value;
  localStorage.setItem('VoirAnime_ratings', JSON.stringify(r));
}

/* ──────────────────────────────────────
   WATCH STATUS — suivi de visionnage
────────────────────────────────────── */
const WATCH_KEY = 'VoirAnime_watchStatus';

function getWatchList() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY) || '{}'); } catch { return {}; }
}

function setWatchStatus(animeId, status, animeData) {
  const list = getWatchList();
  if (status === null) {
    delete list[String(animeId)];
  } else {
    list[String(animeId)] = {
      status,
      title:    animeData.title,
      img:      animeData.img,
      episodes: animeData.episodes || 0,
      duration: animeData.duration || 0,
      addedAt:  Date.now(),
    };
  }
  localStorage.setItem(WATCH_KEY, JSON.stringify(list));
}

function getWatchStatus(animeId) {
  return getWatchList()[String(animeId)]?.status || null;
}

function initWatchStatus(animeId, animeData) {
  const widget = document.getElementById('watchStatusWidget');
  if (!widget) return;

  const btns = widget.querySelectorAll('.watch-status-btn');
  const current = getWatchStatus(animeId);

  // Highlight active button
  btns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === current);
  });

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const newStatus = btn.dataset.status;
      const isSame = newStatus === getWatchStatus(animeId);

      // Toggle off if clicking same button
      setWatchStatus(animeId, isSame ? null : newStatus, animeData);

      btns.forEach(b => b.classList.remove('active'));
      if (!isSame) btn.classList.add('active');

      const labels = { watching: t('watch.label_watching'), completed: t('watch.label_completed'), planToWatch: t('watch.label_plan') };
      showToast(isSame ? t('watch.removed') : labels[newStatus]);
    });
  });
}

function initRating(animeId) {
  const widget    = el('ratingWidget');
  const stars     = el('ratingStars');
  const valueEl   = el('ratingValue');
  const clearBtn  = el('ratingClear');
  if (!widget || !stars) return;

  const ratings  = getRatings();
  let current    = ratings[String(animeId)] || 0;

  function renderStars(hovered = 0) {
    const active = hovered || current;
    stars.querySelectorAll('.rating-star').forEach(s => {
      const v = Number(s.dataset.v);
      s.classList.toggle('active',  v <= active);
      s.classList.toggle('hovered', hovered > 0 && v <= hovered);
    });
    valueEl.textContent = hovered ? `${hovered}/10` : (current ? `${current}/10` : '—');
    if (clearBtn) clearBtn.classList.toggle('hidden', current === 0);
  }

  renderStars();

  // Hover
  stars.querySelectorAll('.rating-star').forEach(s => {
    s.addEventListener('mouseenter', () => renderStars(Number(s.dataset.v)));
    s.addEventListener('mouseleave', () => renderStars(0));
    s.addEventListener('click', () => {
      const v = Number(s.dataset.v);
      current = (current === v) ? 0 : v; // toggle si même note
      saveRating(animeId, current || null);
      renderStars(0);
      showToast(current ? t('rating.saved', current) : t('rating.deleted'));
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      current = 0;
      saveRating(animeId, null);
      renderStars(0);
      showToast(t('rating.deleted'));
    });
  }
}

/* ──────────────────────────────────────
   INIT
────────────────────────────────────── */
async function init() {
  initNavbar();
  initCarouselButtons();

  const params  = new URLSearchParams(window.location.search);
  const animeId = params.get('id');

  if (!animeId) {
    hidePageLoader();
    el('pageLoader').innerHTML = `
      <div style="text-align:center;color:var(--muted)">
        <p style="font-size:2rem;margin-bottom:12px">（；￣д￣）</p>
        <p>${t('anime.not_found')} <a href="index.html" style="color:var(--accent)">← Retour</a></p>
      </div>`;
    return;
  }

  trackView(animeId); // ← après le guard : on sait que l'id est valide

  try {
    const data = await jikanFetch(`/anime/${animeId}/full`);
    renderDetail(data.data);
    requestAnimationFrame(() => initRating(animeId));
    initWatchStatus(animeId, {
      title:    data.data.title_english || data.data.title,
      img:      data.data.images?.jpg?.large_image_url || '',
      episodes: data.data.episodes || 0,
      duration: (() => {
        const d = data.data.duration || '';
        const m = d.match(/(\d+)\s*min/);
        return m ? parseInt(m[1]) : 24;
      })(),
    });
    hidePageLoader();
    loadFranchise(animeId);
    loadRecommendations(animeId, data.data);
    loadVoixMusiques(animeId, data.data);
  } catch (e) {
    hidePageLoader();
    const content = el('animeContent');
    if (content) content.innerHTML = `
      <div style="text-align:center;color:var(--muted);padding:80px 20px;grid-column:1/-1">
        <p style="font-size:2rem;margin-bottom:12px">（；￣д￣）</p>
        <p>${t('anime.load_error')}</p>
        <a href="index.html" style="color:var(--accent);margin-top:16px;display:inline-block">← Retour à l'accueil</a>
      </div>`;
    console.error('Init error:', e);
  }
}


/* ═══════════════════════════════════════════════════════
   VOIX & MUSIQUES — Section accordion
   Données : Jikan /anime/{id}/characters + /full themes
   ═══════════════════════════════════════════════════════ */

async function loadVoixMusiques(animeId, animeData) {
  const section = document.getElementById('animeExtra');
  if (!section) return;

  // Affiche la section (était display:none)
  section.style.display = '';

  // ── Accordion toggle ──
  document.querySelectorAll('.accordion-header').forEach(function(header) {
    header.addEventListener('click', function() {
      const isOpen   = header.getAttribute('aria-expanded') === 'true';
      const targetId = header.getAttribute('aria-controls');
      const content  = document.getElementById(targetId);
      if (!content) return;

      header.setAttribute('aria-expanded', String(!isOpen));
      content.classList.toggle('open', !isOpen);
    });
  });

  // ── Musiques (depuis /full — déjà chargé) ──
  renderMusiques(animeData);

  // ── Voix (appel séparé) ──
  renderVoixSkeleton();
  try {
    const res  = await jikanFetch(`/anime/${animeId}/characters`);
    renderVoix(res.data || []);
  } catch (e) {
    console.warn('[VoixMusiques] Voix indisponibles:', e.message);
    const list = document.getElementById('voiceList');
    if (list) list.innerHTML = `<div class="extra-empty">${t('anime.no_info')}</div>`;
  }
}

/* ── Render Voix ── */
function renderVoix(characters) {
  const list = document.getElementById('voiceList');
  if (!list) return;

  // Filtre : personnages principaux en premier, max 20
  const sorted = characters
    .filter(function(c) { return c.character; })
    .sort(function(a, b) {
      const order = { Main: 0, Supporting: 1 };
      return (order[a.role] || 2) - (order[b.role] || 2);
    })
    .slice(0, 20);

  if (!sorted.length) {
    list.innerHTML = '<div class="extra-empty">Aucune information disponible</div>';
    return;
  }

  list.innerHTML = sorted.map(function(entry) {
    const char    = entry.character;
    const va      = entry.voice_actors && entry.voice_actors.find(function(v) {
      return v.language === 'Japanese';
    });
    const imgSrc  = char.images && char.images.jpg && char.images.jpg.image_url || '';
    const charName = char.name || '—';
    const vaName   = va && va.person && va.person.name || '—';
    const role     = entry.role === 'Main' ? 'Principal' : 'Secondaire';

    return [
      '<div class="voice-card">',
        imgSrc
         ? '<img class="voice-img" src="' + imgSrc + '" alt="' + _esc(charName) + '" loading="lazy" onerror="this.src=\'\'"/>'
          : '<div class="voice-img" style="background:var(--ink3)"></div>',
        '<div class="voice-info">',
          '<div class="voice-character">' + _esc(charName) + '</div>',
          '<div class="voice-actor">' + _esc(vaName) + '</div>',
          '<div class="voice-role">' + role + '</div>',
        '</div>',
      '</div>',
    ].join('');
  }).join('');
}

/* ── Skeleton pendant le chargement des voix ── */
function renderVoixSkeleton() {
  const list = document.getElementById('voiceList');
  if (!list) return;
  list.innerHTML = [1,2,3,4,5].map(function() {
    return [
      '<div class="voice-skeleton">',
        '<div class="sk-block sk-img"></div>',
        '<div class="sk-block sk-line" style="margin:8px 9px 4px"></div>',
        '<div class="sk-block sk-line short" style="margin:4px 9px 8px;width:60%"></div>',
      '</div>',
    ].join('');
  }).join('');
}

/* ── Render Musiques ── */
function renderMusiques(anime) {
  const list = document.getElementById('musicList');
  if (!list) return;

  var openings = anime.theme && anime.theme.openings || [];
  var endings  = anime.theme && anime.theme.endings  || [];

  if (!openings.length && !endings.length) {
    list.innerHTML = '<div class="extra-empty">Aucune information disponible</div>';
    return;
  }

  var cards = [];

  openings.forEach(function(title, i) {
    cards.push(buildMusicCard('Opening ' + (i + 1), title));
  });
  endings.forEach(function(title, i) {
    cards.push(buildMusicCard('Ending ' + (i + 1), title));
  });

  list.innerHTML = cards.join('');
}

function buildMusicCard(type, rawTitle) {
  // rawTitle peut contenir : "1: "Guren no Yumiya" by Linked Horizon"
  var title = rawTitle
    .replace(/^\d+:\s*/, '')          // Supprime le numéro préfixe
    .replace(/^["\u201c]|["\u201d]$/g, '') // Supprime les guillemets
    .trim();

  // Construit la query YouTube
  var ytQuery = encodeURIComponent(title + ' anime ' + type.toLowerCase());
  var ytUrl   = 'https://www.youtube.com/results?search_query=' + ytQuery;
  var spQuery = encodeURIComponent(title);
  var spUrl   = 'https://open.spotify.com/search/' + spQuery;

  return [
    '<div class="music-card">',
      '<div class="music-info">',
        '<div class="music-type">' + _esc(type) + '</div>',
        '<div class="music-title">' + _esc(title) + '</div>',
      '</div>',
      '<div class="music-actions">',
        '<a href="' + ytUrl + '" class="btn-music youtube" target="_blank" rel="noopener">',
          '▶ YouTube',
        '</a>',
        '<a href="' + spUrl + '" class="btn-music spotify" target="_blank" rel="noopener">',
          '🎧 Spotify',
        '</a>',
      '</div>',
    '</div>',
  ].join('');
}

/* ── Escape HTML ── */
function _esc(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

document.addEventListener('DOMContentLoaded', init);
