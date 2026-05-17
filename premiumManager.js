/* ═══════════════════════════════════════════════════════
   premiumManager.js — VoirAnime
   Gère côté client : statut Premium, guards UI, CTA upgrade

   Expose (globaux) :
     VA_isPremium()           → boolean (sync, depuis cache)
     VA_getPremiumData()      → objet complet du statut
     VA_onPremiumReady(cb)    → callback quand statut chargé
     VA_showUpgradePrompt(msg)→ affiche le CTA Premium
     VA_initPremium(piUserId) → init + fetch statut (appelé par chaque page)
   ═══════════════════════════════════════════════════════ */

(function() {
  'use strict';

  const BASE_URL    = 'https://voir-anime.vercel.app';
  const CACHE_KEY   = 'VoirAnime_premiumStatus';
  const CACHE_TTL   = 5 * 60 * 1000; // 5 min

  let _premiumData  = null;
  let _ready        = false;
  let _callbacks    = [];

  /* ── Cache sessionStorage ── */
  function _loadCache() {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (Date.now() - obj._ts > CACHE_TTL) { sessionStorage.removeItem(CACHE_KEY); return null; }
      return obj;
    } catch(e) { return null; }
  }

  function _saveCache(data) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.assign({}, data, { _ts: Date.now() })));
    } catch(e) {}
  }

  /* ── Résolution callbacks ── */
  function _resolve() {
    _ready = true;
    _callbacks.forEach(function(cb) { try { cb(_premiumData); } catch(e) {} });
    _callbacks = [];
  }

  /* ── API publique ── */
  window.VA_isPremium = function() {
    return !!(_premiumData && _premiumData.isPremium);
  };

  window.VA_getPremiumData = function() {
    return _premiumData || {};
  };

  window.VA_clearPremiumCache = function() {
    try { sessionStorage.removeItem(CACHE_KEY); } catch(e) {}
    _premiumData = null;
    _ready       = false;
    // ⚠ NE PAS vider _callbacks ici — premiumPreview.js en a besoin
    // _callbacks = [];   ← ligne originale supprimée intentionnellement
  };

  window.VA_onPremiumReady = function(cb) {
    if (_ready) { try { cb(_premiumData); } catch(e) {} }
    else _callbacks.push(cb);
  };

  /* ── CTA Upgrade — redirection directe vers premium.html ── */
  window.VA_showUpgradePrompt = function(msg, features) {
    window.location.href = 'premium.html';
  };

  /* Features listées dans le popup */
  var _PREMIUM_FEATURES = [
    '📊 Stats avancées & genres préférés',
    '🔥 Recommandations personnalisées',
    '❤️ Favoris illimités',
    '⚡ Accès anticipé aux nouveautés',
    '↕️ Réorganisation de ta liste',
  ];

  /* ── Badge Premium navbar ── */
  function _injectPremiumBadge() {
    var avatar = document.getElementById('navAvatarBtn');
    if (!avatar || document.getElementById('va-premium-badge')) return;
    var badge = document.createElement('span');
    badge.id = 'va-premium-badge';
    badge.textContent = '⭐';
    badge.style.cssText = [
      'position:absolute', 'top:-4px', 'right:-4px',
      'font-size:0.65rem', 'line-height:1',
      'background:linear-gradient(135deg,#a78bfa,#818cf8)',
      'border-radius:50%', 'width:16px', 'height:16px',
      'display:flex', 'align-items:center', 'justify-content:center',
      'z-index:20'
    ].join(';');
    avatar.appendChild(badge);
  }

  /* ── Guards UI automatiques ── */
  /* Usage HTML : <div data-premium-guard data-premium-msg="Message custom"> */
  function _applyGuards() {
    document.querySelectorAll('[data-premium-guard]').forEach(function(el) {
      if (VA_isPremium()) {
        el.style.opacity   = '';
        el.style.pointerEvents = '';
        el.removeAttribute('data-premium-locked');
        return;
      }
      el.style.opacity       = '0.45';
      el.style.pointerEvents = 'none';
      el.setAttribute('data-premium-locked', '1');

      /* Overlay cliquable sur le parent */
      var wrap = el.parentElement;
      if (!wrap || wrap.querySelector('.va-premium-lock')) return;
      var lock = document.createElement('div');
      lock.className = 'va-premium-lock';
      lock.style.cssText = [
        'position:absolute', 'inset:0', 'z-index:10',
        'cursor:pointer', 'display:flex',
        'align-items:center', 'justify-content:center'
      ].join(';');
      lock.innerHTML = '<span style="background:rgba(167,139,250,0.18);border:1px solid rgba(167,139,250,0.4);' +
        'border-radius:10px;padding:6px 14px;font-size:0.78rem;font-weight:700;color:#a78bfa">⭐ Premium</span>';
      lock.onclick = function() {
        VA_showUpgradePrompt(el.getAttribute('data-premium-msg') || null);
      };
      if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
      wrap.appendChild(lock);
    });
  }

  /* ── Init principal ── */
  window.VA_initPremium = function(piUserId) {
    /* 1. Essayer le cache d'abord */
    var cached = _loadCache();
    if (cached) {
      _premiumData = cached;
      _resolve();
      if (VA_isPremium()) { _injectPremiumBadge(); _applyGuards(); }
      _checkExpiryAndNotify(cached);
      /* Refresh en arrière-plan si piUserId connu */
      if (piUserId) _fetchStatus(piUserId, true);
      return;
    }

    /* 2. Pas de cache — fetch direct */
    if (!piUserId) {
      _premiumData = { isPremium: false, subscriptionStatus: 'none' };
      _resolve();
      _applyGuards();
      return;
    }

    _fetchStatus(piUserId, false);
  };

  window.VA_refreshPremium = function(piUserId) {
    window.VA_clearPremiumCache();
    _fetchStatus(piUserId, false);
  };

  function _fetchStatus(piUserId, background) {
    fetch(BASE_URL + '/api/premium?piUserId=' + encodeURIComponent(piUserId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var wasReady   = _ready;
        var wasPremium = _premiumData && _premiumData.isPremium;
        _premiumData = data;
        _saveCache(data);
        if (!background) {
          _resolve();
        } else if (wasReady && data.isPremium !== wasPremium) {
          _callbacks.forEach(function(cb) { try { cb(data); } catch(e) {} });
        }
        if (VA_isPremium()) { _injectPremiumBadge(); _applyGuards(); }
        _checkExpiryAndNotify(data);
      })
      .catch(function() {
        if (!background) {
          _premiumData = { isPremium: false, subscriptionStatus: 'none' };
          _resolve();
          _applyGuards();
        }
      });
  }


  /* ── Modale expiration abonnement ────────────────────────────────────────
     Affiche une modale centrale si l'abonnement expire dans 7j ou 1j.
     Une seule fois par jour max (localStorage).
     Injectée automatiquement sur toutes les pages qui chargent ce fichier.
  ────────────────────────────────────────────────────────────────────────── */

  var EXPIRY_MODAL_KEY = 'VA_expiry_modal_last_shown';

  function _shouldShowExpiryModal(daysLeft) {
    // Afficher uniquement à 7j et 1j
    if (daysLeft !== 7 && daysLeft !== 1) return false;

    // Vérifier si déjà montré aujourd'hui
    try {
      var last = localStorage.getItem(EXPIRY_MODAL_KEY);
      if (last) {
        var lastDate = new Date(parseInt(last));
        var today    = new Date();
        if (
          lastDate.getFullYear() === today.getFullYear() &&
          lastDate.getMonth()    === today.getMonth()    &&
          lastDate.getDate()     === today.getDate()
        ) return false; // déjà montré aujourd'hui
      }
    } catch(e) {}

    return true;
  }

  function _showExpiryModal(daysLeft) {
    // Marquer comme montré aujourd'hui
    try { localStorage.setItem(EXPIRY_MODAL_KEY, Date.now().toString()); } catch(e) {}

    var isUrgent = daysLeft === 1;
    var overlay  = document.createElement('div');
    overlay.id   = 'va-expiry-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px',
      'background:rgba(0,0,0,0.75)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
      'animation:va-fade-in 0.25s ease',
    ].join(';');

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#0e0e1a',
      'border:1px solid ' + (isUrgent ? 'rgba(239,68,68,0.4)' : 'rgba(167,139,250,0.3)'),
      'border-radius:20px',
      'padding:32px 28px',
      'max-width:380px',
      'width:100%',
      'text-align:center',
      'font-family:Outfit,DM Sans,sans-serif',
      'box-shadow:0 24px 60px rgba(0,0,0,0.6)',
      'animation:va-slide-up 0.3s ease',
    ].join(';');

    var icon    = isUrgent ? '🚨' : '⚠️';
    var title   = isUrgent
      ? 'Ton Premium expire <strong>demain</strong> !'
      : 'Ton Premium expire dans <strong>7 jours</strong>';
    var msg     = isUrgent
      ? 'Renouvelle maintenant pour ne pas perdre l'accès à tes favoris illimités, recommandations et stats.'
      : 'N'attends pas la dernière minute — renouvelle ton abonnement et continue à profiter de VoirAnime Premium.';
    var btnColor = isUrgent
      ? 'linear-gradient(135deg,#ef4444,#dc2626)'
      : 'linear-gradient(135deg,#a78bfa,#7c4dff)';

    card.innerHTML = [
      '<div style="font-size:2.5rem;margin-bottom:12px">' + icon + '</div>',
      '<div style="font-size:1.1rem;font-weight:800;color:#e2e8f0;margin-bottom:10px;line-height:1.3">' + title + '</div>',
      '<div style="font-size:0.82rem;color:#94a3b8;line-height:1.6;margin-bottom:24px">' + msg + '</div>',
      '<a href="soutenir.html" style="display:block;background:' + btnColor + ';color:#fff;',
      'padding:13px 20px;border-radius:12px;font-weight:700;font-size:0.9rem;',
      'text-decoration:none;margin-bottom:12px;transition:opacity 0.15s">',
      '⭐ Renouveler mon abonnement</a>',
      '<button id="va-expiry-later" style="background:transparent;border:none;',
      'color:#64748b;font-size:0.78rem;cursor:pointer;font-family:inherit;',
      'padding:8px;width:100%">Plus tard</button>',
    ].join('');

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Fermer au clic "Plus tard" ou sur l'overlay
    document.getElementById('va-expiry-later').onclick = function() {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.2s';
      setTimeout(function() { overlay.remove(); }, 200);
    };
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s';
        setTimeout(function() { overlay.remove(); }, 200);
      }
    });

    // Injecter les animations CSS si pas déjà présentes
    if (!document.getElementById('va-expiry-styles')) {
      var style = document.createElement('style');
      style.id  = 'va-expiry-styles';
      style.textContent = [
        '@keyframes va-fade-in { from { opacity:0 } to { opacity:1 } }',
        '@keyframes va-slide-up { from { opacity:0;transform:translateY(20px) } to { opacity:1;transform:translateY(0) } }',
      ].join('');
      document.head.appendChild(style);
    }
  }

  function _checkExpiryAndNotify(data) {
    if (!data || !data.isPremium) return;
    var daysLeft = data.daysLeft || 0;
    if (_shouldShowExpiryModal(daysLeft)) {
      // Délai de 2s pour laisser la page se charger
      setTimeout(function() { _showExpiryModal(daysLeft); }, 2000);
    }
  }

  /* ── Auto-init si pi_user déjà en localStorage ── */
  document.addEventListener('DOMContentLoaded', function() {
    /* Attendre pi-auth.js (délai 1.5s comme les autres managers) */
    setTimeout(function() {
      var piUser = null;
      try { piUser = JSON.parse(localStorage.getItem('pi_user') || 'null'); } catch(e) {}
      var uid = piUser && piUser.uid;

      /* VA_initPremium peut aussi être appelé manuellement depuis la page */
      if (!_ready) VA_initPremium(uid || null);
    }, 1500);
  });

})();
