/* ═══════════════════════════════════════════
   VoirAnime — Section "Pour toi"
   Alertes + recommandations basées sur localStorage
   ═══════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Helpers localStorage ── */
  function getWatchList() {
    try { return JSON.parse(localStorage.getItem('VoirAnime_watchStatus') || '{}'); } catch { return {}; }
  }
  function getFavs() {
    try { return JSON.parse(localStorage.getItem('VoirAnime_favs') || '[]'); } catch { return []; }
  }
  function getHistory() {
    try { return JSON.parse(localStorage.getItem('VoirAnime_history') || '[]'); } catch { return []; }
  }
  function getDismissed() {
    try { return JSON.parse(localStorage.getItem('VoirAnime_alertsDismissed') || '[]'); } catch { return []; }
  }
  function saveDismissed(arr) {
    localStorage.setItem('VoirAnime_alertsDismissed', JSON.stringify(arr));
  }

  /* ── Extraire genres depuis les données user ── */
  function getUserGenres() {
    const watchList = getWatchList();
    const favs      = getFavs();
    const history   = getHistory();
    const genreCount = {};

    function countGenres(item) {
      if (!item) return;
      const genres = item.genres || item.genre || [];
      const arr = Array.isArray(genres) ? genres : [genres];
      arr.forEach(g => {
        if (!g) return;
        const key = (typeof g === 'string' ? g : g.name || '').trim();
        if (key) genreCount[key] = (genreCount[key] || 0) + 1;
      });
    }

    Object.values(watchList).forEach(countGenres);
    favs.forEach(countGenres);
    history.forEach(countGenres);

    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(e => e[0]);
  }

  /* ── Construire les alertes ── */
  function buildAlerts(userGenres, watchList) {
    const dismissed = getDismissed();
    const alerts    = [];
    const watching  = Object.values(watchList).filter(a => a.status === 'watching');

    /* Alerte 1 — Nouvel épisode simulé pour les animes "en cours" */
    watching.slice(0, 2).forEach(anime => {
      const id = 'ep_' + anime.malId;
      if (!dismissed.includes(id) && anime.title) {
        alerts.push({
          id,
          type: 'episode',
          icon: '🎬',
          text: `Nouvel épisode disponible pour <strong>${anime.title}</strong>`,
          link: anime.malId ? `anime.html?id=${anime.malId}` : null
        });
      }
    });

    /* Alerte 2 — Recommandation basée sur genres */
    if (userGenres.length > 0) {
      const id = 'reco_' + userGenres[0].replace(/\s/g, '_');
      if (!dismissed.includes(id)) {
        alerts.push({
          id,
          type: 'reco',
          icon: '✨',
          text: `Tu aimes <strong>${userGenres[0]}</strong> — explore le catalogue pour découvrir de nouvelles pépites.`,
          link: 'catalogue.html'
        });
      }
    }

    /* Alerte 3 — Watchlist non commencée */
    const planTo = Object.values(watchList).filter(a => a.status === 'planToWatch');
    if (planTo.length > 0) {
      const id = 'plan_' + planTo[0].malId;
      if (!dismissed.includes(id) && planTo[0].title) {
        alerts.push({
          id,
          type: 'plan',
          icon: '📋',
          text: `<strong>${planTo[0].title}</strong> attend dans ta liste — prêt à te lancer ?`,
          link: planTo[0].malId ? `anime.html?id=${planTo[0].malId}` : null
        });
      }
    }

    return alerts;
  }

  /* ── Fetch "Pour toi" depuis Jikan API ── */
  async function fetchPourToi(userGenres) {
    if (!userGenres.length) return [];
    const genre = userGenres[0];

    /* Mapping genre texte → ID Jikan (genres courants) */
    const genreMap = {
      'Action': 1, 'Adventure': 2, 'Comedy': 4, 'Drama': 8,
      'Fantasy': 10, 'Horror': 14, 'Mystery': 7, 'Romance': 22,
      'Sci-Fi': 24, 'Slice of Life': 36, 'Sports': 30, 'Thriller': 41,
      'Supernatural': 37, 'Psychological': 40, 'Seinen': 42, 'Shounen': 27
    };
    const gid = genreMap[genre];
    const url = gid
      ? `https://api.jikan.moe/v4/anime?genres=${gid}&order_by=score&sort=desc&limit=6&sfw=true`
      : `https://api.jikan.moe/v4/top/anime?limit=6&sfw=true`;

    try {
      const res  = await fetch(url);
      const json = await res.json();
      return (json.data || []).slice(0, 6);
    } catch {
      return [];
    }
  }

  /* ── Render ── */
  function renderCard(anime) {
    const img   = anime.images?.jpg?.image_url || '';
    const title = anime.title || anime.title_english || '?';
    const score = anime.score ? `⭐ ${anime.score}` : '';
    const id    = anime.mal_id;
    return `
      <a href="anime.html?id=${id}" class="pt-card">
        <img src="${img}" alt="${title}" loading="lazy" onerror="this.src='https://placehold.co/120x170/0f0e1a/555?text=?'"/>
        <div class="pt-card-info">
          <span class="pt-card-title">${title}</span>
          ${score ? `<span class="pt-card-score">${score}</span>` : ''}
        </div>
      </a>`;
  }

  function renderAlertItem(alert) {
    return `
      <div class="pt-alert pt-alert-${alert.type}" data-id="${alert.id}">
        <span class="pt-alert-icon">${alert.icon}</span>
        <span class="pt-alert-text">${alert.text}${alert.link ? ` <a href="${alert.link}" class="pt-alert-link">Voir →</a>` : ''}</span>
        <button class="pt-alert-dismiss" aria-label="Masquer" onclick="VAPourToi.dismiss('${alert.id}')">✕</button>
      </div>`;
  }

  async function render() {
    const section = document.getElementById('pourToiSection');
    if (!section) return;

    const watchList  = getWatchList();
    const favs       = getFavs();
    const history    = getHistory();
    const hasData    = Object.keys(watchList).length > 0 || favs.length > 0 || history.length > 0;

    if (!hasData) { section.style.display = 'none'; return; }

    const userGenres = getUserGenres();
    const alerts     = buildAlerts(userGenres, watchList);
    const animes     = await fetchPourToi(userGenres);

    /* Masquer si tout est dismissed et pas d'animes */
    if (alerts.length === 0 && animes.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    const alertsEl = document.getElementById('pourToiAlerts');
    const cardsEl  = document.getElementById('pourToiCards');
    const labelEl  = document.getElementById('pourToiGenreLabel');

    if (alertsEl) alertsEl.innerHTML = alerts.map(renderAlertItem).join('');
    if (cardsEl)  cardsEl.innerHTML  = animes.map(renderCard).join('');
    if (labelEl && userGenres.length) labelEl.textContent = userGenres[0];
  }

  /* ── API publique ── */
  window.VAPourToi = {
    dismiss: function (id) {
      const dismissed = getDismissed();
      if (!dismissed.includes(id)) {
        dismissed.push(id);
        saveDismissed(dismissed);
      }
      const el = document.querySelector(`.pt-alert[data-id="${id}"]`);
      if (el) {
        el.style.opacity = '0';
        el.style.height  = el.offsetHeight + 'px';
        setTimeout(() => { el.style.height = '0'; el.style.margin = '0'; el.style.padding = '0'; }, 200);
        setTimeout(() => el.remove(), 420);
      }
    },
    refresh: render
  };

  /* ── Init au chargement ── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
