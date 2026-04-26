/* ═══════════════════════════════
   VoirAnime — SIMPLE LANG SYSTEM
   English default + optional FR
   ═══════════════════════════════ */

const LANG_KEY = 'VoirAnime_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) || 'en';
}

function setLang(lang) {
  localStorage.setItem(LANG_KEY, lang);
  location.reload();
}

window.VA_LANG = getLang();
window.setLang = setLang;

/* Simple translator (optional use only) */
const DICT = {
  fr: {
    search: "Rechercher",
    filters: "Filtres",
    reset: "Réinitialiser",
    results: "résultats",
    loading: "Chargement...",
  }
};

function t(key) {
  if (window.VA_LANG === 'fr') {
    return DICT.fr[key] || key;
  }
  return key; // English default
}

window.t = t;
