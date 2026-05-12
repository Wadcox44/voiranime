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
      })
      .catch(function() {
        if (!background) {
          _premiumData = { isPremium: false, subscriptionStatus: 'none' };
          _resolve();
          _applyGuards();
        }
      });
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
