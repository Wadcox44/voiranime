/* ═══════════════════════════════════════════════════════════════
   introAnimation.js — VoirAnime
   Intro : pétales sakura + frappe katana horizontale + logo zoom.

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
    duration: 4500,
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

  function _easeOut(t)  { return 1 - Math.pow(1 - t, 4); }
  function _smooth(t)   { return t * t * (3 - 2 * t); }

  /* ── Injection CSS ── */
  function _injectStyles() {
    if (document.getElementById('va-intro-styles')) return;
    var s = document.createElement('style');
    s.id = 'va-intro-styles';
    s.textContent = [
      '#va-intro-overlay {',
        'position:fixed !important;',
        'top:0 !important; left:0 !important;',
        'right:0 !important; bottom:0 !important;',
        'width:100% !important; height:100% !important;',
        'z-index:999999 !important;',
        'background:#000 !important;',
        'overflow:hidden !important;',
        'transform:none !important;',
        'animation:none !important;',
        'margin:0 !important; padding:0 !important;',
        'cursor:pointer;',
        'transition:opacity 0.5s ease;',
      '}',
      '#va-intro-canvas {',
        'position:absolute; inset:0;',
        'width:100%; height:100%;',
        'pointer-events:none;',
      '}',
      '#va-intro-logo {',
        'position:absolute;',
        'left:50%; top:50%;',
        'transform:translate(-50%,-50%) scale(1.2);',
        'text-align:center;',
        'z-index:10;',
        'pointer-events:none;',
        'opacity:0;',
        'filter:blur(4px);',
        'white-space:nowrap;',
        'will-change:opacity,transform,filter;',
      '}',
      '#va-intro-logo.visible {',
        'opacity:1;',
        'transform:translate(-50%,-50%) scale(1);',
        'filter:blur(0px);',
        'transition:opacity 1.2s cubic-bezier(0.16,1,0.3,1),',
          'transform 1.3s cubic-bezier(0.16,1,0.3,1),',
          'filter 1.1s ease;',
      '}',
      '#va-intro-wordmark {',
        'font-family:Outfit,system-ui,-apple-system,sans-serif;',
        'font-size:clamp(1.8rem,7vw,3rem);',
        'font-weight:900;',
        'letter-spacing:-0.5px;',
        'display:inline-block;',
        'transform:skewX(-4deg);',
        'line-height:1;',
      '}',
      '#va-intro-voir  { color:#ffffff; display:inline-block; }',
      '#va-intro-anime {',
        'color:#22d3ee; display:inline-block;',
        'transition:text-shadow 1s ease;',
      '}',
      '#va-intro-tagline {',
        'display:block;',
        'font-family:Outfit,system-ui,-apple-system,sans-serif;',
        'font-size:0.56rem;',
        'font-weight:500;',
        'letter-spacing:0.3em;',
        'text-transform:uppercase;',
        'color:rgba(255,255,255,0.24);',
        'margin-top:12px;',
      '}',
    ].join('\n');
    document.head.appendChild(s);
  }

  /* ── Construction overlay ── */
  function _buildOverlay() {
    var ov = document.createElement('div');
    ov.id = 'va-intro-overlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = [
      '<canvas id="va-intro-canvas"></canvas>',
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

  /* ── Séquence ── */
  function _run(ov, onDone) {
    var cv      = document.getElementById('va-intro-canvas');
    var ctx     = cv.getContext('2d');
    var logo    = document.getElementById('va-intro-logo');
    var anime   = document.getElementById('va-intro-anime');

    var W, H;
    function resize() {
      W = cv.width  = window.innerWidth;
      H = cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    /* Pétales */
    var petals = (function() {
      var arr = [];
      for (var i = 0; i < 32; i++) {
        arr.push({
          x: Math.random() * window.innerWidth,
          y: -20 - Math.random() * window.innerHeight * 0.5,
          r: 2 + Math.random() * 2.8,
          vx: (Math.random() - 0.5) * 0.7,
          vy: 1.3 + Math.random() * 1.6,
          rot: Math.random() * Math.PI * 2,
          vrot: (Math.random() - 0.5) * 0.05,
          o: 0, maxO: 0.25 + Math.random() * 0.32,
          born: Math.random() * 250,
          hue: 338 + Math.random() * 25,
        });
      }
      return arr;
    })();

    var dur     = CONFIG.duration;
    var start   = performance.now();
    var animId  = null;
    var logoShown = false;
    var timers  = [];

    var T_BLADE  = 300;
    var T_IMPACT = 720;
    var T_LOGO   = 1020;
    var T_GLOW   = 2200;

    function tick(now) {
      var el = now - start;
      var p  = Math.min(el / dur, 1);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);

      /* Fond rose/nuit */
      var bg = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.65);
      bg.addColorStop(0, 'rgba(30,4,42,' + Math.min(el/600, 0.5) + ')');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      /* Pétales */
      petals.forEach(function(pt) {
        if (el < pt.born) return;
        pt.y += pt.vy;
        pt.x += pt.vx + Math.sin(el * 0.001 + pt.rot) * 0.3;
        pt.rot += pt.vrot;
        pt.o = Math.min(pt.o + 0.008, pt.maxO);
        if (pt.y > H + 12) { pt.y = -12; pt.x = Math.random() * W; pt.o = 0; pt.born = el + 150; }
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(pt.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, pt.r, pt.r * 1.65, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'hsla(' + pt.hue + ',72%,82%,' + pt.o + ')';
        ctx.fill();
        ctx.restore();
      });

      /* Lame horizontale */
      if (el >= T_BLADE && el < T_IMPACT + 150) {
        var bp  = _easeOut(Math.min((el - T_BLADE) / 400, 1));
        var cx  = (-W * 0.05) + (W * 1.1) * bp;
        var cy  = H / 2;
        var trl = W * 0.38;
        var tx  = Math.max(-W * 0.05, cx - trl);

        /* traîne large */
        var tg = ctx.createLinearGradient(tx, 0, cx, 0);
        tg.addColorStop(0,    'rgba(200,230,255,0)');
        tg.addColorStop(0.5,  'rgba(220,240,255,0.07)');
        tg.addColorStop(0.85, 'rgba(255,255,255,0.25)');
        tg.addColorStop(1,    'rgba(255,255,255,0)');
        ctx.fillStyle = tg;
        ctx.fillRect(tx, cy - 10, cx - tx, 20);

        /* fils de lame */
        [[0, 0.95], [3, 0.5], [-3, 0.35]].forEach(function(l) {
          var off = l[0], alpha = l[1];
          var lg2 = ctx.createLinearGradient(tx, 0, cx, 0);
          lg2.addColorStop(0,   'rgba(200,230,255,0)');
          lg2.addColorStop(0.6, 'rgba(255,255,255,' + (alpha * 0.5) + ')');
          lg2.addColorStop(1,   'rgba(255,255,255,' + alpha + ')');
          ctx.beginPath();
          ctx.moveTo(tx, cy + off);
          ctx.lineTo(cx, cy + off);
          ctx.strokeStyle = lg2;
          ctx.lineWidth = off === 0 ? 1.5 : 0.6;
          ctx.stroke();
        });

        /* éclat au front */
        if (bp < 0.98) {
          var eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 28);
          eg.addColorStop(0,    'rgba(255,255,255,0.95)');
          eg.addColorStop(0.35, 'rgba(220,240,255,0.45)');
          eg.addColorStop(1,    'rgba(255,255,255,0)');
          ctx.fillStyle = eg;
          ctx.beginPath();
          ctx.arc(cx, cy, 28, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* Flash d'impact */
      if (el >= T_IMPACT) {
        var fp = _smooth(Math.min((el - T_IMPACT) / 160, 1));
        if (fp < 1) {
          ctx.fillStyle = 'rgba(255,255,255,' + (fp * (1 - fp) * 4) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* Ligne de coupure persistante */
      if (el >= T_IMPACT) {
        var la = 1 - _smooth(Math.min((el - T_IMPACT) / 950, 1));
        if (la > 0) {
          var lc = ctx.createLinearGradient(0, 0, W, 0);
          lc.addColorStop(0,   'rgba(220,240,255,0)');
          lc.addColorStop(0.2, 'rgba(255,255,255,' + (la * 0.7) + ')');
          lc.addColorStop(0.8, 'rgba(220,240,255,' + (la * 0.7) + ')');
          lc.addColorStop(1,   'rgba(220,240,255,0)');
          ctx.strokeStyle = lc;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, H / 2);
          ctx.lineTo(W, H / 2);
          ctx.stroke();
        }

        /* écartement subtil */
        var sp   = _easeOut(Math.min((el - T_IMPACT) / 600, 1));
        var fade = 1 - _smooth(Math.min((el - T_IMPACT) / 900, 1));
        if (fade > 0 && sp > 0) {
          var gap = sp * 10 * fade;
          ctx.fillStyle = 'rgba(200,230,255,' + (fade * 0.12) + ')';
          ctx.fillRect(0, H / 2 - gap, W, gap * 2);
        }
      }

      /* Logo */
      if (el >= T_LOGO && !logoShown) {
        logoShown = true;
        logo.classList.add('visible');
      }

      /* Glow cyan */
      if (el >= T_GLOW) {
        var gp = _smooth(Math.min((el - T_GLOW) / 600, 1));
        anime.style.textShadow = '0 0 35px rgba(34,211,238,' + (0.55 * gp) + '),0 0 70px rgba(34,211,238,' + (0.18 * gp) + ')';
      }

      if (p < 1) {
        animId = requestAnimationFrame(tick);
      } else {
        window.removeEventListener('resize', resize);
        onDone();
      }
    }

    animId = requestAnimationFrame(tick);

    return function cancel() {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }

  /* ── Teardown ── */
  function _teardown(ov) {
    ov.style.opacity = '0';
    setTimeout(function() {
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      var s = document.getElementById('va-intro-styles');
      if (s && s.parentNode) s.parentNode.removeChild(s);
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }, 520);
  }

  /* ── Play ── */
  function play() {
    return new Promise(function(resolve) {
      _injectStyles();
      var ov = _buildOverlay();
      document.documentElement.appendChild(ov);
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      var cancelFn = null;

      function done() {
        _markPlayed();
        _teardown(ov);
        resolve();
      }

      ov.addEventListener('click', function() {
        if (cancelFn) cancelFn();
        _teardown(ov);
        _markPlayed();
        resolve();
      });

      function onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          if (cancelFn) cancelFn();
          _teardown(ov);
          _markPlayed();
          resolve();
        }
      }
      document.addEventListener('keydown', onKey);

      var failsafe = setTimeout(function() {
        document.removeEventListener('keydown', onKey);
        if (cancelFn) cancelFn();
        done();
      }, CONFIG.duration + 1500);

      cancelFn = _run(ov, function() {
        clearTimeout(failsafe);
        document.removeEventListener('keydown', onKey);
        done();
      });
    });
  }

  /* ── API publique ── */
  window.VA_Intro = {
    play:    play,
    skip:    function() { var o = document.getElementById('va-intro-overlay'); if (o) o.click(); },
    reset:   function() { localStorage.removeItem(KEYS.once); sessionStorage.removeItem(KEYS.session); },
    setMode: function(m) { if (['always','once','session'].indexOf(m) >= 0) CONFIG.mode = m; },
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
