/* ═══════════════════════════════════════════════════════════════
   introAnimation.js — VoirAnime
   Intro cinématique : fade in pur, 3.5s, mobile first.

   CONFIG :
     mode    : 'session' → une fois par session (recommandé)
               'once'    → une seule fois à vie
               'always'  → à chaque chargement

   Usage :
     <script src="introAnimation.js"></script>
     → démarre automatiquement.

   API :
     VA_Intro.play()    → rejoue
     VA_Intro.skip()    → passe immédiatement
     VA_Intro.reset()   → remet le compteur à zéro
     VA_Intro.setMode() → 'session' | 'once' | 'always'
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const CONFIG = {
    mode:     'session',
    duration: 3500,
  };

  const KEYS = {
    once:    'VA_INTRO_SEEN',
    session: 'VA_INTRO_SESSION',
  };

  function _shouldPlay() {
    if (CONFIG.mode === 'always')  return true;
    if (CONFIG.mode === 'once')    return !localStorage.getItem(KEYS.once);
    if (CONFIG.mode === 'session') return !sessionStorage.getItem(KEYS.session);
    return true;
  }

  function _markPlayed() {
    if (CONFIG.mode === 'once')    localStorage.setItem(KEYS.once, '1');
    if (CONFIG.mode === 'session') sessionStorage.setItem(KEYS.session, '1');
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  /* ── Crée l'overlay ── */
  function _buildOverlay() {
    const ov = document.createElement('div');
    ov.id = 'va-intro-overlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:999999',
      'background:#000',
      'display:flex', 'align-items:center', 'justify-content:center',
      'overflow:hidden',
      'transform:none',
      'animation:none',
    ].join(';');

    ov.innerHTML = `
      <canvas id="va-intro-canvas" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none"></canvas>
      <div id="va-intro-logo" style="
        position:relative;z-index:10;text-align:center;
        opacity:0;pointer-events:none;will-change:opacity;
      ">
        <div style="
          font-family:'Outfit',system-ui,sans-serif;
          font-size:clamp(1.8rem,6vw,3rem);
          font-weight:900;letter-spacing:-0.5px;
          display:inline-block;transform:skewX(-4deg);
          line-height:1;
        ">
          <span id="va-intro-voir"  style="color:#fff;display:inline-block">Voir</span><span
                id="va-intro-anime" style="color:#22d3ee;display:inline-block">Anime</span>
        </div>
        <div id="va-intro-tagline" style="
          font-family:'Outfit',system-ui,sans-serif;
          font-size:0.58rem;font-weight:500;
          letter-spacing:0.32em;text-transform:uppercase;
          color:rgba(255,255,255,0);
          margin-top:13px;display:block;
          will-change:opacity;
        "></div>
      </div>
    `;

    return ov;
  }

  /* ── Séquence ── */
  function _run(ov, onDone) {
    const cv      = document.getElementById('va-intro-canvas');
    const ctx     = cv.getContext('2d');
    const logo    = document.getElementById('va-intro-logo');
    const voir    = document.getElementById('va-intro-voir');
    const anime   = document.getElementById('va-intro-anime');
    const tagline = document.getElementById('va-intro-tagline');

    let W, H;
    function resize() {
      W = cv.width  = window.innerWidth;
      H = cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    setTimeout(() => { tagline.textContent = 'Découvre autrement'; }, 100);

    const dur   = CONFIG.duration;
    const start = performance.now();
    let animId  = null;
    let taglineShown = false;

    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      /* Halo violet — respire en premier */
      const hp = smoothstep(Math.min(Math.max(p / 0.45, 0), 1));
      if (hp > 0) {
        const r = Math.max(W, H) * 0.6 * hp;
        const g = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, r);
        g.addColorStop(0,    `rgba(55,25,130,${0.22 * hp})`);
        g.addColorStop(0.55, `rgba(20,8,55,${0.1 * hp})`);
        g.addColorStop(1,    'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      /* Halo cyan discret, plus tardif */
      const cp = smoothstep(Math.min(Math.max((p - 0.4) / 0.4, 0), 1));
      if (cp > 0) {
        const r2 = Math.max(W, H) * 0.38 * cp;
        const g2 = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, r2);
        g2.addColorStop(0, `rgba(10,80,120,${0.1 * cp})`);
        g2.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, W, H);
      }

      /* Logo — fade in pur très lent */
      const lp = smoothstep(Math.min(Math.max((p - 0.20) / 0.40, 0), 1));
      if (lp > 0) {
        logo.style.opacity = lp.toFixed(4);
      }

      /* Glow sur le logo, après lui */
      const gp = smoothstep(Math.min(Math.max((p - 0.50) / 0.30, 0), 1));
      if (gp > 0) {
        voir.style.textShadow  = `0 0 ${50 * gp}px rgba(255,255,255,${0.14 * gp})`;
        anime.style.textShadow = `0 0 ${45 * gp}px rgba(34,211,238,${0.45 * gp}),0 0 ${90 * gp}px rgba(34,211,238,${0.12 * gp})`;
      }

      /* Tagline */
      if (p >= 0.68 && !taglineShown) {
        taglineShown = true;
        tagline.style.transition = `color ${dur * 0.28}ms ease`;
        tagline.style.color = 'rgba(255,255,255,0.22)';
      }

      if (p < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        window.removeEventListener('resize', resize);
        onDone(animId);
      }
    }

    animId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }

  /* ── Teardown ── */
  function _teardown(ov) {
    ov.style.transition = 'opacity 0.5s ease';
    ov.style.opacity    = '0';
    setTimeout(() => {
      ov.remove();
      document.body.style.overflow = '';
    }, 520);
  }

  /* ── Play ── */
  function play() {
    return new Promise(resolve => {
      document.body.style.overflow = 'hidden';

      const ov   = _buildOverlay();
      document.body.appendChild(ov);
      let stopFn = null;

      function done() {
        _markPlayed();
        _teardown(ov);
        resolve();
      }

      ov.addEventListener('click', () => {
        if (stopFn) stopFn();
        done();
      });

      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          if (stopFn) stopFn();
          done();
        }
      }
      document.addEventListener('keydown', onKey);

      const failsafe = setTimeout(() => {
        if (stopFn) stopFn();
        done();
      }, CONFIG.duration + 1200);

      stopFn = _run(ov, () => {
        clearTimeout(failsafe);
        document.removeEventListener('keydown', onKey);
        done();
      });
    });
  }

  /* ── API publique ── */
  window.VA_Intro = {
    play,
    skip:    () => { const ov = document.getElementById('va-intro-overlay'); if (ov) ov.click(); },
    reset:   () => { localStorage.removeItem(KEYS.once); sessionStorage.removeItem(KEYS.session); },
    setMode: (m) => { if (['always','once','session'].includes(m)) CONFIG.mode = m; },
  };

  /* ── Auto-play ── */
  function _autoplay() {
    if (_shouldPlay()) play();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoplay);
  } else {
    // Délai minimal pour garantir que le body est prêt à recevoir l'overlay
    setTimeout(_autoplay, 0);
  }

})();
