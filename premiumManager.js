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

  window.VA_onPremiumReady = function(cb) {
    if (_ready) { try { cb(_premiumData); } catch(e) {} }
    else _callbacks.push(cb);
  };

  /* ── CTA Upgrade ── */
  window.VA_showUpgradePrompt = function(msg) {
    var existing = document.getElementById('va-upgrade-prompt');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'va-upgrade-prompt';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'background:rgba(8,7,15,0.85)', 'backdrop-filter:blur(8px)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'padding:24px'
    ].join(';');

    overlay.innerHTML = [
      '<div style="background:var(--ink3);border:1px solid rgba(167,139,250,0.4);border-radius:20px;',
      'padding:32px 28px;max-width:420px;width:100%;text-align:center;position:relative">',
      '<button onclick="document.getElementById(\'va-upgrade-prompt\').remove()" ',
      'style="position:absolute;top:12px;right:16px;background:none;border:none;',
      'color:var(--muted);font-size:1.2rem;cursor:pointer;font-family:var(--font)">✕</button>',
      '<div style="font-size:2rem;margin-bottom:12px">⭐</div>',
      '<div style="font-size:1.15rem;font-weight:800;color:var(--text);margin-bottom:8px">',
      'Fonctionnalité Premium</div>',
      '<p style="font-size:0.88rem;color:var(--text2);line-height:1.6;margin-bottom:20px">',
      (msg || 'Cette fonctionnalité est réservée aux abonnés Premium.'), '</p>',
      '<a href="soutenir.html?tab=premium" ',
      'style="display:inline-flex;align-items:center;gap:8px;',
      'background:linear-gradient(135deg,#a78bfa,#818cf8);color:#fff;',
      'font-family:var(--font);font-weight:700;font-size:0.95rem;',
      'padding:11px 24px;border-radius:12px;text-decoration:none;',
      'transition:opacity 0.2s" onmouseover="this.style.opacity=\'0.88\'" ',
      'onmouseout="this.style.opacity=\'1\'">',
      'Découvrir Premium →</a>',
      '<p style="font-size:0.75rem;color:var(--muted);margin-top:12px">',
      'À partir de 1.99 Pi/mois</p>',
      '</div>'
    ].join('');

    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  };

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
      'display:flex', 'align-items:center', 'justify-content:center'
    ].join(';');
    avatar.style.position = 'relative';
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

  function _fetchStatus(piUserId, background) {
    fetch(BASE_URL + '/api/premium?piUserId=' + encodeURIComponent(piUserId))
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _premiumData = data;
        _saveCache(data);
        if (!background) _resolve();
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
