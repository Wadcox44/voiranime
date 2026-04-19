/* ═══════════════════════════════════════════════════════
   VoirAnime — i18n v2
   - Chargement JSON (en / fr / es / de) depuis /locales/
   - Détection : Pi Network → navigateur → 'en'
   - Fallback automatique vers 'en' si clé manquante
   - Interpolation : t('key', {n:5}) → "Based on your 5 anime"
   ═══════════════════════════════════════════════════════ */

const VA_SUPPORTED = ['en', 'fr', 'es', 'de'];
const VA_DEFAULT   = 'en';

function VA_detectLang() {
  const saved = localStorage.getItem('VoirAnime_lang');
  if (saved && VA_SUPPORTED.includes(saved)) return saved;
  try {
    if (window.Pi) {
      const code = (navigator.language || '').toLowerCase().slice(0, 2);
      if (VA_SUPPORTED.includes(code)) return code;
    }
  } catch (_) {}
  const langs = navigator.languages || [navigator.language || VA_DEFAULT];
  for (const lang of langs) {
    const code = lang.toLowerCase().slice(0, 2);
    if (VA_SUPPORTED.includes(code)) return code;
  }
  return VA_DEFAULT;
}

let VA_LANG     = VA_detectLang();
let VA_DICT     = {};
let VA_READY    = false;
const VA_CBS    = [];

async function VA_loadTranslations(lang) {
  try {
    const res = await fetch('/locales/' + lang + '.json?v=2');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    console.warn('[i18n] Failed to load ' + lang + '.json');
    if (lang !== VA_DEFAULT) {
      try {
        const res2 = await fetch('/locales/' + VA_DEFAULT + '.json?v=2');
        return await res2.json();
      } catch (_) {}
    }
    return {};
  }
}

function t(key, vars) {
  let val = VA_DICT[key];
  if (val === undefined) {
    // Essayer le fallback inline
    var fb = VA_FALLBACK[key];
    if (fb !== undefined) val = fb;
    else {
      if (VA_READY) console.warn('[i18n] Missing key: "' + key + '"');
      return key;
    }
  }
  if (vars && typeof vars === 'object') {
    val = val.replace(/\{(\w+)\}/g, function(_, k) {
      return vars[k] !== undefined ? vars[k] : '{' + k + '}';
    });
  } else if (arguments.length > 1) {
    var args = Array.prototype.slice.call(arguments, 1);
    var i = 0;
    val = val.replace(/\{(\w+)\}/g, function(match, k) {
      var v = args[i++];
      return v !== undefined ? v : match;
    });
  }
  return val;
}

function VA_applyDOM() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    var val = t(key);
    if (val === key) return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });
}

function VA_setLang(lang) {
  if (!VA_SUPPORTED.includes(lang)) return;
  localStorage.setItem('VoirAnime_lang', lang);
  location.reload();
}

function VA_onReady(cb) {
  if (VA_READY) { cb(); return; }
  VA_CBS.push(cb);
}


/* Fallback inline — types critiques utilisés avant chargement JSON */
const VA_FALLBACK = {
  'type.tv': 'Series', 'type.movie': 'Movie', 'type.ova': 'OVA',
  'type.ona': 'ONA', 'type.special': 'Special', 'type.streaming': 'Streaming',
  'fav.added': '{0} added to favorites', 'fav.removed': '{0} removed from favorites',
  'rating.saved': 'Rating saved: {0}/10 ⭐', 'rating.deleted': 'Rating removed',
  'common.error_load': 'Unable to load.', 'section.error': 'Unable to load this section.',
};

async function VA_init() {
  VA_DICT  = await VA_loadTranslations(VA_LANG);
  VA_READY = true;
  VA_applyDOM();
  VA_CBS.forEach(function(cb) { cb(); });
  document.documentElement.lang = VA_LANG;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', VA_init);
} else {
  VA_init();
}

window.t            = t;
window.VA_LANG      = VA_LANG;
window.VA_setLang   = VA_setLang;
window.VA_onReady   = VA_onReady;
window.VA_SUPPORTED = VA_SUPPORTED;
