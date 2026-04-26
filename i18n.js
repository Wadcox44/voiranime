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

/* ═══════════════════════════════
   LANGUAGE DROPDOWN SYSTEM
   ═══════════════════════════════ */

window.changeLang = function(lang) {
  setLang(lang);
};

window.toggleLangMenu = function(event) {
  event.stopPropagation();
  document.getElementById("langMenu")?.classList.toggle("open");
};

document.addEventListener("click", () => {
  document.getElementById("langMenu")?.classList.remove("open");
});

window.addEventListener("DOMContentLoaded", () => {
  const flag = document.getElementById("currentLangFlag");
  if (!flag) return;

  flag.textContent = window.VA_LANG === "fr"
    ? "🇫🇷"
    : "🇬🇧";
});
