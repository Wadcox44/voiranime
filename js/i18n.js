'use strict';

/* ═══════════════════════════════════════
   VoirAnime i18n v3 — Async JSON Loader
═══════════════════════════════════════ */

const VA_LANG_KEY = 'VoirAnime_lang';
const VA_SUPPORTED = ['en', 'fr', 'es', 'de'];

let VA_LANG = 'en';
let VA_DICT = {};

/* ─────────────────────────────
   Detection langue
───────────────────────────── */
function getPiLang() {
  try {
    const locale =
      window.Pi?.userInfo?.locale ||
      window.Pi?.currentUser?.locale ||
      null;

    if (!locale) return null;

    const lang = locale.split('-')[0].toLowerCase();
    return VA_SUPPORTED.includes(lang) ? lang : null;
  } catch {
    return null;
  }
}

function detectLang() {
  const saved = localStorage.getItem(VA_LANG_KEY);
  if (saved && VA_SUPPORTED.includes(saved)) return saved;

  const piLang = getPiLang();
  if (piLang) return piLang;

  const navLang = navigator.language?.split('-')[0].toLowerCase();
  if (VA_SUPPORTED.includes(navLang)) return navLang;

  return 'en';
}

/* ─────────────────────────────
   Chargement JSON
───────────────────────────── */
async function loadLang(lang) {
  try {
    const res = await fetch(`/locales/${lang}.json`);
    if (!res.ok) throw new Error('Missing locale');

    VA_DICT = await res.json();
    VA_LANG = lang;

    localStorage.setItem(VA_LANG_KEY, lang);

    applyTranslations();
    updateLangUI();

    document.dispatchEvent(
      new CustomEvent('va:langchange', {
        detail: { lang }
      })
    );

  } catch (err) {
    console.error('[i18n] Load failed:', err);
  }
}

/* ─────────────────────────────
   Traduction
───────────────────────────── */
function t(key, params = {}) {
  let str = VA_DICT[key] || key;

  for (const [k, v] of Object.entries(params)) {
    str = str.replaceAll(`{${k}}`, v);
  }

  return str;
}

/* ─────────────────────────────
   Application DOM
───────────────────────────── */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);

    if (val.includes('<')) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });

  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria));
  });

  document.documentElement.lang = VA_LANG;
}

/* ─────────────────────────────
   UI
───────────────────────────── */
function updateLangUI() {
  const btn = document.getElementById('langBtn');
  if (btn) {
    btn.textContent = VA_LANG === 'fr' ? '🇫🇷' : '🇬🇧';
  }
}

/* ─────────────────────────────
   Public API
───────────────────────────── */
window.setLang = lang => {
  if (!VA_SUPPORTED.includes(lang)) return;
  loadLang(lang);
};

window.getLang = () => VA_LANG;
window.t = t;
window.applyTranslations = applyTranslations;

/* ─────────────────────────────
   Dropdown
───────────────────────────── */
window.toggleLangMenu = e => {
  e?.stopPropagation();
  document.getElementById('langMenu')?.classList.toggle('open');
};

document.addEventListener('click', () => {
  document.getElementById('langMenu')?.classList.remove('open');
});

/* ─────────────────────────────
   Init
───────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadLang(detectLang());
});
