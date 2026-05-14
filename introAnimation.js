/* ═══════════════════════════════════════════════════════════════
   introAnimation.js — VoirAnime
   Intro cinématique : fade in pur, CSS uniquement, robuste mobile.

   Mode    : 'session' → une fois par session (recommandé)
             'once'    → une seule fois à vie
             'always'  → à chaque chargement

   API :
     VA_Intro.play()    → rejoue
     VA_Intro.skip()    → passe immédiatement
     VA_Intro.reset()   → remet le compteur à zéro
     VA_Intro.setMode() → 'session' | 'once' | 'always'
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var CONFIG = {
    mode:     'session',
    duration: 5000,
  };

  var KEYS = {
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

  /* ── Injection CSS ────────────────────────────────────────────
     Tout est géré en CSS pour éviter les problèmes de canvas
     sur Pi Browser et Safari mobile.
  ────────────────────────────────────────────────────────────── */
  function _injectStyles() {
    if (document.getElementById('va-intro-styles')) return;
    var style = document.createElement('style');
    style.id = 'va-intro-styles';
    style.textContent = [

      /* Overlay plein écran — isolé du body */
      '#va-intro-overlay {',
        'position: fixed !important;',
        'top: 0 !important;',
        'left: 0 !important;',
        'right: 0 !important;',
        'bottom: 0 !important;',
        'width: 100% !important;',
        'height: 100% !important;',
        'z-index: 999999 !important;',
        'background: #000 !important;',
        'display: flex !important;',
        'align-items: center !important;',
        'justify-content: center !important;',
        'overflow: hidden !important;',
        'transform: none !important;',
        'animation: none !important;',
        'margin: 0 !important;',
        'padding: 0 !important;',
        'cursor: pointer;',
        'opacity: 1;',
        'transition: opacity 0.5s ease;',
      '}',

      /* Halo violet — fond animé */
      '#va-intro-halo {',
        'position: absolute;',
        'top: 50%;',
        'left: 50%;',
        'width: 70vw;',
        'height: 70vw;',
        'max-width: 500px;',
        'max-height: 500px;',
        'border-radius: 50%;',
        'transform: translate(-50%, -50%) scale(0);',
        'background: radial-gradient(circle, rgba(55,25,130,0.5) 0%, rgba(20,8,55,0.2) 50%, transparent 70%);',
        'pointer-events: none;',
        'transition: transform 1.8s cubic-bezier(0.16,1,0.3,1), opacity 1.8s ease;',
        'opacity: 0;',
      '}',
      '#va-intro-halo.visible {',
        'transform: translate(-50%, -50%) scale(1);',
        'opacity: 1;',
      '}',

      /* Halo cyan secondaire */
      '#va-intro-halo2 {',
        'position: absolute;',
        'top: 50%;',
        'left: 50%;',
        'width: 50vw;',
        'height: 50vw;',
        'max-width: 380px;',
        'max-height: 380px;',
        'border-radius: 50%;',
        'transform: translate(-50%, -50%) scale(0);',
        'background: radial-gradient(circle, rgba(10,80,120,0.25) 0%, transparent 70%);',
        'pointer-events: none;',
        'transition: transform 1.4s cubic-bezier(0.16,1,0.3,1) 0.6s, opacity 1.4s ease 0.6s;',
        'opacity: 0;',
      '}',
      '#va-intro-halo2.visible {',
        'transform: translate(-50%, -50%) scale(1);',
        'opacity: 1;',
      '}',

      /* Logo — centré absolu */
      '#va-intro-logo {',
        'position: relative;',
        'z-index: 2;',
        'text-align: center;',
        'opacity: 0;',
        'pointer-events: none;',
        'transition: opacity 1.4s cubic-bezier(0.16,1,0.3,1);',
      '}',
      '#va-intro-logo.visible {',
        'opacity: 1;',
      '}',

      /* Wordmark */
      '#va-intro-wordmark {',
        'font-family: Outfit, system-ui, -apple-system, sans-serif;',
        'font-size: clamp(1.8rem, 7vw, 3rem);',
        'font-weight: 900;',
        'letter-spacing: -0.5px;',
        'display: inline-block;',
        'transform: skewX(-4deg);',
        'line-height: 1;',
      '}',

      '#va-intro-voir {',
        'color: #ffffff;',
        'display: inline-block;',
        'transition: text-shadow 1.2s ease;',
      '}',
      '#va-intro-voir.glow {',
        'text-shadow: 0 0 40px rgba(255,255,255,0.25);',
      '}',

      '#va-intro-anime {',
        'color: #22d3ee;',
        'display: inline-block;',
        'transition: text-shadow 1.2s ease;',
      '}',
      '#va-intro-anime.glow {',
        'text-shadow: 0 0 40px rgba(34,211,238,0.6), 0 0 80px rgba(34,211,238,0.2);',
      '}',

      /* Tagline */
      '#va-intro-tagline {',
        'display: block;',
        'font-family: Outfit, system-ui, -apple-system, sans-serif;',
        'font-size: 0.58rem;',
        'font-weight: 500;',
        'letter-spacing: 0.32em;',
        'text-transform: uppercase;',
        'color: rgba(255,255,255,0);',
        'margin-top: 13px;',
        'transition: color 1.4s ease;',
      '}',
      '#va-intro-tagline.visible {',
        'color: rgba(255,255,255,0.22);',
      '}',

    ].join('\n');

    document.head.appendChild(style);
  }

  /* ── Construction de l'overlay ─────────────────────────────── */
  function _buildOverlay() {
    var ov = document.createElement('div');
    ov.id = 'va-intro-overlay';
    ov.setAttribute('aria-hidden', 'true');

    ov.innerHTML = [
      '<div id="va-intro-halo"></div>',
      '<div id="va-intro-halo2"></div>',
      '<div id="va-intro-logo">',
        '<div id="va-intro-wordmark">',
          '<span id="va-intro-voir">Voir</span>',
          '<span id="va-intro-anime">Anime</span>',
        '</div>',
        '<span id="va-intro-tagline">Découvre autrement</span>',
      '</div>',
    ].join('');

    return ov;
  }

  /* ── Séquence d'animation ──────────────────────────────────── */
  function _runSequence(ov, onDone) {
    var dur = CONFIG.duration;

    /* Timing relatif (ms) */
    var T = {
      halo:    0,
      logo:    Math.round(dur * 0.22),
      glow:    Math.round(dur * 0.52),
      tagline: Math.round(dur * 0.68),
      fadeOut: Math.round(dur * 0.88),
    };

    var timers = [];

    function later(fn, ms) {
      timers.push(setTimeout(fn, ms));
    }

    /* Halos */
    later(function () {
      var h = document.getElementById('va-intro-halo');
      var h2 = document.getElementById('va-intro-halo2');
      if (h)  h.classList.add('visible');
      if (h2) h2.classList.add('visible');
    }, T.halo);

    /* Logo */
    later(function () {
      var logo = document.getElementById('va-intro-logo');
      if (logo) logo.classList.add('visible');
    }, T.logo);

    /* Glow */
    later(function () {
      var voir  = document.getElementById('va-intro-voir');
      var anime = document.getElementById('va-intro-anime');
      if (voir)  voir.classList.add('glow');
      if (anime) anime.classList.add('glow');
    }, T.glow);

    /* Tagline */
    later(function () {
      var tag = document.getElementById('va-intro-tagline');
      if (tag) tag.classList.add('visible');
    }, T.tagline);

    /* Fade out overlay */
    later(function () {
      ov.style.opacity = '0';
    }, T.fadeOut);

    /* Teardown */
    later(function () {
      timers.forEach(clearTimeout);
      onDone();
    }, dur);

    return function cancel() {
      timers.forEach(clearTimeout);
    };
  }

  /* ── Teardown ── */
  function _teardown(ov) {
    setTimeout(function () {
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      var s = document.getElementById('va-intro-styles');
      if (s && s.parentNode) s.parentNode.removeChild(s);
      document.body.style.overflow = '';
    }, 100);
  }

  /* ── Play ── */
  function play() {
    return new Promise(function (resolve) {
      _injectStyles();

      var ov = _buildOverlay();
      document.body.appendChild(ov);
      document.body.style.overflow = 'hidden';

      var cancelFn = null;

      function done() {
        _markPlayed();
        _teardown(ov);
        resolve();
      }

      /* Skip sur tap / clic */
      ov.addEventListener('click', function () {
        if (cancelFn) cancelFn();
        ov.style.opacity = '0';
        setTimeout(done, 520);
      });

      /* Skip clavier */
      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          if (cancelFn) cancelFn();
          ov.style.opacity = '0';
          setTimeout(done, 520);
        }
      }
      document.addEventListener('keydown', onKey);

      /* Failsafe */
      var failsafe = setTimeout(function () {
        document.removeEventListener('keydown', onKey);
        if (cancelFn) cancelFn();
        done();
      }, CONFIG.duration + 1500);

      cancelFn = _runSequence(ov, function () {
        clearTimeout(failsafe);
        document.removeEventListener('keydown', onKey);
        done();
      });
    });
  }

  /* ── API publique ── */
  window.VA_Intro = {
    play:    play,
    skip:    function () { var o = document.getElementById('va-intro-overlay'); if (o) o.click(); },
    reset:   function () { localStorage.removeItem(KEYS.once); sessionStorage.removeItem(KEYS.session); },
    setMode: function (m) { if (['always','once','session'].indexOf(m) >= 0) CONFIG.mode = m; },
  };

  /* ── Auto-play ── */
  function _autoplay() {
    if (_shouldPlay()) play();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoplay);
  } else {
    setTimeout(_autoplay, 50);
  }

})();
