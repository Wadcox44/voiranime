/* ═══════════════════════════════════════════════════════
   VoirAnime — i18n v2.1 (clean + safe)
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

let VA_LANG  = VA_detectLang();
let VA_DICT  = {};
let VA_READY = false;
const VA_CBS = [];

async function VA_loadTranslations(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json?v=2`);
    if (!res.ok) throw new Error(res.status);

    const json = await res.json();
    return json || {};
  } catch (e) {
    console.warn('[i18n] Failed to load', lang);

    if (lang !== VA_DEFAULT) {
      try {
        const res2 = await fetch(`/locales/${VA_DEFAULT}.json?v=2`);
        const json2 = await res2.json();
        return json2 || {};
      } catch (_) {}
    }

    return {};
  }
}

function t(key, vars) {
  let val = VA_DICT?.[key];

  if (val === undefined) {
    const fb = VA_FALLBACK[key];
    if (fb !== undefined) val = fb;
    else {
      if (VA_READY) console.warn('[i18n] Missing key:', key);
      return key;
    }
  }

  if (vars && typeof vars === 'object') {
    val = val.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? vars[k] : `{${k}}`
    );
  }

  return val;
}

function VA_applyDOM(root = document) {
  const nodes = root.querySelectorAll('[data-i18n]');

  for (const el of nodes) {
    const key = el.getAttribute('data-i18n');
    const val = t(key);

    if (val === key) continue;

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  }
}

function VA_setLang(lang) {
  if (!VA_SUPPORTED.includes(lang)) return;

  localStorage.setItem('VoirAnime_lang', lang);
  VA_LANG = lang;
  window.VA_LANG = lang;

  VA_loadTranslations(lang).then(dict => {
    VA_DICT = dict || {};
    VA_applyDOM();
  });
}

function VA_onReady(cb) {
  if (VA_READY) return cb();
  VA_CBS.push(cb);
}

const VA_FALLBACK = {
  'type.tv': 'Series',
  'type.movie': 'Movie',
  'type.ova': 'OVA',
  'type.ona': 'ONA',
  'type.special': 'Special',
  'type.streaming': 'Streaming',

  'fav.added': '{0} added to favorites',
  'fav.removed': '{0} removed from favorites',

  'rating.saved': 'Rating saved: {0}/10 ⭐',
  'rating.deleted': 'Rating removed',

  'common.error_load': 'Unable to load.',
  'section.error': 'Unable to load this section.',
};

async function VA_init() {
  VA_DICT = await VA_loadTranslations(VA_LANG);
  VA_READY = true;

  VA_applyDOM();

  VA_CBS.forEach(cb => cb());

  document.documentElement.lang = VA_LANG;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', VA_init);
} else {
  VA_init();
}

window.t = t;
window.VA_LANG = VA_LANG;
window.VA_setLang = VA_setLang;
window.VA_onReady = VA_onReady;
window.VA_SUPPORTED = VA_SUPPORTED;

window.VA_retranslate = () => VA_applyDOM();
window.VA_applyDOM = VA_applyDOM;
