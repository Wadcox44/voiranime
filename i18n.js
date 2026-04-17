/* ═══════════════════════════════════════════════════
   VoirAnime — i18n (EN / FR)
   Usage : t('clé') → string dans la langue active
   Langue : détection auto navigator.language + toggle
   ═══════════════════════════════════════════════════ */

const VA_DICT = {

  /* ── Navbar ── */
  'nav.home':       { fr: 'Accueil',   en: 'Home' },
  'nav.catalogue':  { fr: 'Catalogue', en: 'Catalogue' },
  'nav.duels':      { fr: '⚔ Duels',  en: '⚔ Duels' },
  'nav.profile':    { fr: 'Profil',    en: 'Profile' },
  'nav.support':    { fr: '💜 Soutenir', en: '💜 Support' },
  'nav.tagline':    { fr: 'Découvre autrement.', en: 'Discover differently.' },
  'nav.search':     { fr: 'Recherche', en: 'Search' },
  'nav.lang_btn':   { fr: 'EN', en: 'FR' },

  /* ── Footer ── */
  'footer.no_video': { fr: 'Aucune vidéo n\'est hébergée sur ce site.', en: 'No video is hosted on this site.' },
  'footer.copy':     { fr: '© 2025 VoirAnime — Projet open source', en: '© 2025 VoirAnime — Open source project' },
  'footer.data':     { fr: 'Données fournies par', en: 'Data provided by' },

  /* ── Recherche ── */
  'search.placeholder': { fr: 'Titre, genre, personnage…', en: 'Title, genre, character…' },
  'search.results':     { fr: 'Résultats de recherche', en: 'Search results' },
  'search.close':       { fr: '✕ Fermer', en: '✕ Close' },
  'search.empty':       { fr: 'Aucun résultat. Essaie un autre titre.', en: 'No results. Try another title.' },
  'search.label':       { fr: (q) => `Recherche : « ${q} »`, en: (q) => `Search: "${q}"` },
  'search.count':       { fr: (n, q) => `${n} résultat${n > 1 ? 's' : ''} pour « ${q} »`, en: (n, q) => `${n} result${n > 1 ? 's' : ''} for "${q}"` },
  'search.error':       { fr: 'Erreur de connexion. Réessaie dans quelques secondes.', en: 'Connection error. Try again in a few seconds.' },

  /* ── Recherche avancée ── */
  'adv.title':      { fr: 'Recherche avancée', en: 'Advanced search' },
  'adv.genre':      { fr: 'Genre',         en: 'Genre' },
  'adv.type':       { fr: 'Type',           en: 'Type' },
  'adv.score':      { fr: 'Score minimum',  en: 'Minimum score' },
  'adv.status':     { fr: 'Statut',         en: 'Status' },
  'adv.year':       { fr: 'Année',          en: 'Year' },
  'adv.search_btn': { fr: 'Rechercher',     en: 'Search' },
  'adv.clear':      { fr: '✕ Effacer',      en: '✕ Clear' },
  'adv.all':        { fr: 'Tous',           en: 'All' },
  'adv.results':    { fr: (p) => p.length ? p.join(' · ') : 'Tous les animes', en: (p) => p.length ? p.join(' · ') : 'All anime' },
  'adv.no_results': { fr: 'Aucun résultat pour ces critères.', en: 'No results for these criteria.' },
  'adv.error':      { fr: 'Erreur de connexion.', en: 'Connection error.' },

  /* ── Types / Statuts ── */
  'type.tv':       { fr: 'Série',    en: 'Series' },
  'type.movie':    { fr: 'Film',     en: 'Movie' },
  'type.ova':      { fr: 'OVA',      en: 'OVA' },
  'type.ona':      { fr: 'ONA',      en: 'ONA' },
  'type.special':  { fr: 'Spécial',  en: 'Special' },
  'status.airing':    { fr: 'En cours',  en: 'Airing' },
  'status.complete':  { fr: 'Terminé',   en: 'Completed' },
  'status.upcoming':  { fr: 'À venir',   en: 'Upcoming' },
  'sort.score':    { fr: 'Score',          en: 'Score' },
  'sort.date':     { fr: 'Date de sortie', en: 'Release date' },
  'sort.title':    { fr: 'Titre',          en: 'Title' },
  'sort.label':    { fr: 'Trier par',      en: 'Sort by' },

  /* ── Mood pills ── */
  'mood.eyebrow':        { fr: 'Dans quel état d\'esprit tu es ce soir ?', en: 'What mood are you in tonight?' },
  'mood.all':            { fr: 'Tout explorer', en: 'Explore all' },
  'mood.action':         { fr: 'Adrénaline',    en: 'Adrenaline' },
  'mood.romance':        { fr: 'Romance',        en: 'Romance' },
  'mood.dark':           { fr: 'Univers Sombre', en: 'Dark Universe' },
  'mood.comedy':         { fr: 'Bonne Humeur',   en: 'Good Vibes' },
  'mood.scifi':          { fr: 'Sci-fi & Mecha', en: 'Sci-fi & Mecha' },
  'mood.psychological':  { fr: 'Mind-bending',   en: 'Mind-bending' },
  'mood.slice':          { fr: 'Zen & Calme',    en: 'Zen & Calm' },

  /* ── Zones narratives index ── */
  'zone1.title': { fr: 'Ce qui vit en ce moment',      en: 'What\'s alive right now' },
  'zone1.sub':   { fr: 'Anime en cours de diffusion · Tendances · Films récents', en: 'Currently airing · Trending · Recent films' },
  'zone2.title': { fr: 'Ce qui a traversé le temps',   en: 'What stood the test of time' },
  'zone2.sub':   { fr: 'Chefs-d\'œuvre · Références absolues · Films cultes', en: 'Masterpieces · Must-watches · Cult films' },
  'zone3.title': { fr: 'Ton univers',                  en: 'Your universe' },
  'zone3.sub':   { fr: 'Tes favoris · Ton histoire · Tes explorations', en: 'Your favorites · Your history · Your explorations' },

  /* ── Sections index ── */
  'section.popular':   { fr: '🔥 Les plus populaires', en: '🔥 Most popular' },
  'section.top':       { fr: '⭐ Les mieux notés',      en: '⭐ Top rated' },
  'section.airing':    { fr: '📡 En cours de diffusion', en: '📡 Currently airing' },
  'section.movies':    { fr: '🎬 Films d\'anime',        en: '🎬 Anime films' },
  'section.trending':  { fr: '📈 Trending sur VoirAnime', en: '📈 Trending on VoirAnime' },
  'section.for_you':   { fr: '✨ Pour toi',              en: '✨ For you' },
  'section.favorites': { fr: 'Mes Favoris',              en: 'My Favorites' },
  'section.results':   { fr: 'Résultats',                en: 'Results' },
  'section.reprendre': { fr: 'Reprendre',                en: 'Continue' },
  'section.top25':     { fr: 'Top 25',                   en: 'Top 25' },
  'section.error':     { fr: 'Impossible de charger cette section.', en: 'Unable to load this section.' },

  /* ── Anime du jour ── */
  'adj.label':     { fr: 'Anime du jour',      en: 'Anime of the day' },
  'adj.shuffle':   { fr: 'Autre suggestion',   en: 'Another pick' },
  'adj.watch':     { fr: 'Voir l\'anime →',    en: 'View anime →' },
  'adj.error':     { fr: 'Impossible de charger le hero.', en: 'Unable to load featured anime.' },

  /* ── Zone personnelle ── */
  'personal.empty_title': { fr: 'Ton univers est vide pour l\'instant.', en: 'Your universe is empty for now.' },
  'personal.empty_sub':   { fr: 'Explore des animes, ajoute des favoris — cet espace grandira avec toi.', en: 'Explore anime, add favorites — this space will grow with you.' },
  'personal.empty_cta':   { fr: 'Commencer à explorer →', en: 'Start exploring →' },
  'personal.profile_link':{ fr: 'Voir le profil →', en: 'View profile →' },

  /* ── Alertes "Pour toi" ── */
  'alert.episode':  { fr: (title) => `Nouvel épisode disponible pour ${title}`, en: (title) => `New episode available for ${title}` },
  'alert.plan':     { fr: (title) => `${title} attend dans ta liste — prêt ?`, en: (title) => `${title} is waiting in your list — ready?` },
  'alert.badge_fallback': { fr: 'Sélection du moment', en: 'Current selection' },
  'alert.badge_based':    { fr: (n) => `Basé sur tes ${n} animes`, en: (n) => `Based on your ${n} anime` },

  /* ── Fiche anime ── */
  'anime.synopsis':    { fr: 'Synopsis',              en: 'Synopsis' },
  'anime.read_more':   { fr: 'Lire plus ▼',           en: 'Read more ▼' },
  'anime.genres':      { fr: 'Genres & Thèmes',       en: 'Genres & Themes' },
  'anime.score':       { fr: 'Score MAL',             en: 'MAL Score' },
  'anime.where':       { fr: 'Où regarder',           en: 'Where to watch' },
  'anime.voices':      { fr: 'Voix des personnages',  en: 'Character voices' },
  'anime.music':       { fr: 'Musiques',              en: 'Music' },
  'anime.no_info':     { fr: 'Aucune information disponible', en: 'No information available' },
  'anime.my_rating':   { fr: 'Ma note',               en: 'My rating' },
  'anime.my_tracking': { fr: 'Mon suivi',             en: 'My tracking' },
  'anime.sound_on':    { fr: 'Activer le son',        en: 'Enable sound' },
  'anime.sound_off':   { fr: 'Couper le son',         en: 'Mute' },
  'anime.fr_synopsis': { fr: '🇫🇷 Voir en français',  en: '🇬🇧 View in English' },
  'anime.airing_badge':{ fr: '● En cours',            en: '● Airing' },

  /* ── Watch status ── */
  'watch.watching':    { fr: '▶ En cours',    en: '▶ Watching' },
  'watch.completed':   { fr: '✓ Terminé',     en: '✓ Completed' },
  'watch.plan':        { fr: '🔖 À regarder', en: '🔖 Plan to watch' },
  'watch.filter_all':  { fr: 'Tous',          en: 'All' },
  'watch.filter_completed': { fr: '✓ Terminés', en: '✓ Completed' },
  'watch.filter_watching':  { fr: '▶ En cours', en: '▶ Watching' },

  /* ── Profil ── */
  'profile.title':       { fr: 'Mon Profil',           en: 'My Profile' },
  'profile.since':       { fr: 'Membre depuis aujourd\'hui', en: 'Member since today' },
  'profile.favs':        { fr: 'Favoris',              en: 'Favorites' },
  'profile.visited':     { fr: 'Animes visités',       en: 'Anime visited' },
  'profile.rated':       { fr: 'Animes notés',         en: 'Anime rated' },
  'profile.duels':       { fr: 'Duels joués',          en: 'Duels played' },
  'profile.streak':      { fr: 'Streak 🔥',            en: 'Streak 🔥' },
  'profile.completed':   { fr: 'Terminés ✓',           en: 'Completed ✓' },
  'profile.watching':    { fr: 'En cours ▶',           en: 'Watching ▶' },
  'profile.plan':        { fr: 'À regarder 🔖',        en: 'Plan to watch 🔖' },
  'profile.hours':       { fr: 'Heures vues',          en: 'Hours watched' },
  'profile.no_tracking':    { fr: 'Aucun anime dans ton suivi.', en: 'No anime in your tracking.' },
  'profile.no_favs':        { fr: 'Aucun favori pour l\'instant.', en: 'No favorites yet.' },
  'profile.no_favs_hint':   { fr: 'Clique sur ❤ sur n\'importe quelle fiche anime !', en: 'Click ❤ on any anime page!' },
  'profile.no_history':     { fr: 'Ton historique est vide.', en: 'Your history is empty.' },
  'profile.no_history_hint':{ fr: 'Commence à explorer des animes !', en: 'Start exploring anime!' },
  'profile.no_ratings':     { fr: 'Tu n\'as encore noté aucun anime.', en: 'You haven\'t rated any anime yet.' },
  'profile.no_ratings_hint':{ fr: 'Visite une fiche anime et clique sur les étoiles !', en: 'Visit an anime page and click the stars!' },
  'profile.badge_recruit':  { fr: '🌱 Nouvelle recrue', en: '🌱 New recruit' },
  'profile.badge_first_fav':{ fr: '⭐ Premier favori', en: '⭐ First favorite' },
  'profile.badge_fan':      { fr: '❤ Fan confirmé',    en: '❤ Confirmed fan' },
  'profile.badge_explorer': { fr: '🎌 Explorateur',    en: '🎌 Explorer' },
  'profile.badge_duelist':  { fr: '⚔ Duelliste',       en: '⚔ Duelist' },
  'profile.badge_champion': { fr: '🏆 Champion',        en: '🏆 Champion' },
  'profile.timeago_now':    { fr: 'À l\'instant',       en: 'Just now' },
  'profile.timeago_min':    { fr: (m) => `Il y a ${m} min`, en: (m) => `${m}m ago` },
  'profile.timeago_h':      { fr: (h) => `Il y a ${h}h`,   en: (h) => `${h}h ago` },
  'profile.timeago_d':      { fr: (d) => `Il y a ${d} jour${d > 1 ? 's' : ''}`, en: (d) => `${d} day${d > 1 ? 's' : ''} ago` },
  'profile.timeago_mo':     { fr: (m) => `Il y a ${m} mois`, en: (m) => `${m} month${m > 1 ? 's' : ''} ago` },

  /* ── Duel ── */
  'duel.loading':     { fr: 'Chargement du duel…',             en: 'Loading duel…' },
  'duel.title':       { fr: 'Lequel préfères-tu ?',            en: 'Which do you prefer?' },
  'duel.subtitle':    { fr: 'Vote pour ton favori — vois ce que pensent les autres.', en: 'Vote for your favorite — see what others think.' },
  'duel.hint':        { fr: '← → ou clic',                    en: '← → or click' },
  'duel.vote_a':      { fr: 'Voter pour lui',                  en: 'Vote for this' },
  'duel.vote_b':      { fr: 'Voter pour lui',                  en: 'Vote for this' },
  'duel.view_anime':  { fr: 'Voir l\'anime ›',                 en: 'View anime ›' },
  'duel.agree':       { fr: 'd\'accord',                       en: 'agree' },
  'duel.majority':    { fr: 'la majorité — seulement',         en: 'the majority — only' },
  'duel.voters':      { fr: 'des votants —',                   en: 'of voters —' },
  'duel.with':        { fr: 'avec',                            en: 'with' },
  'duel.against':     { fr: 'contre',                          en: 'against' },
  'duel.no_duels':    { fr: '0 duel joué',                     en: '0 duels played' },
  'duel.leaderboard': { fr: '🏆 Classement populaire',         en: '🏆 Popular leaderboard' },
  'duel.lb_show':     { fr: 'Afficher ▼',                      en: 'Show ▼' },
  'duel.lb_hide':     { fr: 'Masquer ▲',                       en: 'Hide ▲' },
  'duel.lb_empty':    { fr: 'Joue quelques duels pour voir le classement !', en: 'Play a few duels to see the leaderboard!' },
  'duel.anime_num':   { fr: (id) => `Anime #${id}`,            en: (id) => `Anime #${id}` },

  /* ── Catalogue ── */
  'cat.title':      { fr: 'Catalogue',                          en: 'Catalogue' },
  'cat.subtitle':   { fr: 'Explore tous les animes — filtre, trie, découvre.', en: 'Explore all anime — filter, sort, discover.' },
  'cat.search':     { fr: 'Recherche',                          en: 'Search' },
  'cat.score_min':  { fr: 'Score min.',                        en: 'Min. score' },
  'cat.empty':      { fr: 'Aucun anime trouvé pour ces critères.', en: 'No anime found for these criteria.' },
  'cat.empty_hint': { fr: 'Essaie d\'autres filtres !',         en: 'Try different filters!' },
  'cat.load_more':  { fr: 'Charger plus',                       en: 'Load more' },

  /* ── Soutenir ── */
  'sup.title':      { fr: 'Soutenir VoirAnime',         en: 'Support VoirAnime' },
  'sup.subtitle':   { fr: 'Projet 100% indépendant : les dons servent à couvrir les coûts du serveur et à financer le développement.', en: '100% independent project: donations cover server costs and fund development.' },
  'sup.amounts_title': { fr: 'Choisir un montant (Pi)', en: 'Choose an amount (Pi)' },
  'sup.label_1':    { fr: 'Curieux',       en: 'Curious' },
  'sup.label_2':    { fr: 'Contributeur',  en: 'Contributor' },
  'sup.label_5':    { fr: 'Soutien',       en: 'Supporter' },
  'sup.label_10':   { fr: 'Pilier',        en: 'Pillar' },
  'sup.popular':    { fr: 'Populaire',     en: 'Popular' },
  'sup.top':        { fr: '★ Top',         en: '★ Top' },
  'sup.custom':     { fr: 'Montant libre', en: 'Custom amount' },
  'sup.btn':        { fr: (n) => `Envoyer ${n} Pi via Pi Wallet`, en: (n) => `Send ${n} Pi via Pi Wallet` },
  'sup.merci':      { fr: 'Merci pour ton soutien 🙏',   en: 'Thank you for your support 🙏' },
  'sup.close':      { fr: 'Fermer',                      en: 'Close' },
  'sup.pioneers':   { fr: 'Nos Pioneers — Merci à vous 💜', en: 'Our Pioneers — Thank you 💜' },

  /* ── Commun ── */
  'common.error_load': { fr: 'Impossible de charger cette ambiance.', en: 'Unable to load this mood.' },
  'common.no_video':   { fr: 'Aucune vidéo disponible',               en: 'No video available' },
};

/* ══════════════════════════════════════════
   Détection et gestion de la langue
══════════════════════════════════════════ */

function VA_detectLang() {
  const saved = localStorage.getItem('VoirAnime_lang');
  if (saved === 'en' || saved === 'fr') return saved;
  const browser = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  return browser.startsWith('fr') ? 'fr' : 'en';
}

let VA_LANG = VA_detectLang();

function t(key, ...args) {
  const entry = VA_DICT[key];
  if (!entry) { console.warn(`[i18n] clé manquante: ${key}`); return key; }
  const val = entry[VA_LANG] ?? entry['en'];
  return typeof val === 'function' ? val(...args) : val;
}

function VA_setLang(lang) {
  VA_LANG = lang;
  localStorage.setItem('VoirAnime_lang', lang);
  location.reload();
}

function VA_toggleLang() {
  VA_setLang(VA_LANG === 'fr' ? 'en' : 'fr');
}

/* ══════════════════════════════════════════
   Injection du bouton langue dans la navbar
══════════════════════════════════════════ */

function VA_injectLangBtn() {
  const navRight = document.querySelector('.nav-right');
  if (!navRight || document.getElementById('va-lang-btn')) return;

  const btn = document.createElement('button');
  btn.id        = 'va-lang-btn';
  btn.className = 'va-lang-btn';
  btn.textContent = VA_LANG === 'fr' ? 'EN' : 'FR';
  btn.setAttribute('aria-label', VA_LANG === 'fr' ? 'Switch to English' : 'Passer en français');
  btn.addEventListener('click', VA_toggleLang);
  navRight.prepend(btn);
}

/* ══════════════════════════════════════════
   Application des traductions au DOM HTML
   (pour les éléments data-i18n="clé")
══════════════════════════════════════════ */

function VA_applyDOM() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = val;
    } else {
      el.textContent = val;
    }
  });

  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });

  // Mettre à jour title de page si défini
  const titleKey = document.body.getAttribute('data-page-title');
  if (titleKey) document.title = t(titleKey);
}

/* ══════════════════════════════════════════
   Init automatique au chargement
══════════════════════════════════════════ */

(function VA_i18nInit() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      VA_injectLangBtn();
      VA_applyDOM();
    });
  } else {
    VA_injectLangBtn();
    VA_applyDOM();
  }
})();


  /* ── anime.js strings ── */
  'anime.fav_added':     { fr: (t) => `❤ ${t} ajouté aux favoris`,    en: (t) => `❤ ${t} added to favorites` },
  'anime.fav_removed':   { fr: (t) => `💔 ${t} retiré des favoris`,   en: (t) => `💔 ${t} removed from favorites` },
  'anime.no_video_avail':{ fr: 'Aucune vidéo disponible',              en: 'No video available' },
  'anime.fullscreen':    { fr: 'Plein écran',  en: 'Full screen' },
  'anime.reduce':        { fr: 'Réduire',      en: 'Reduce' },
  'anime.read_less':     { fr: 'Réduire ▲',    en: 'Read less ▲' },
  'anime.translate_fr':  { fr: '🇫🇷 Voir en français',   en: '🇬🇧 View in English' },
  'anime.translate_orig':{ fr: '↩ Version originale',    en: '↩ Original version' },
  'anime.translate_ing': { fr: '⏳ Traduction…',          en: '⏳ Translating…' },
  'anime.translate_err': { fr: 'Traduction indisponible pour le moment.', en: 'Translation unavailable at the moment.' },
  'anime.no_synopsis':   { fr: 'Aucun synopsis disponible.', en: 'No synopsis available.' },
  'anime.unknown_title': { fr: 'Titre inconnu', en: 'Unknown title' },
  'anime.no_reco':       { fr: 'Aucune recommandation disponible.', en: 'No recommendations available.' },
  'anime.reco_error':    { fr: 'Impossible de charger les recommandations.', en: 'Unable to load recommendations.' },
  'anime.reco_loading':  { fr: 'Chargement…',  en: 'Loading…' },
  'anime.not_found':     { fr: 'Aucun anime spécifié.', en: 'No anime specified.' },
  'anime.load_error':    { fr: 'Impossible de charger cet anime.', en: 'Unable to load this anime.' },
  'anime.votes':         { fr: (n) => `${n} votes`, en: (n) => `${n} votes` },
  'anime.rank':          { fr: (r) => `Rang #${r}`,  en: (r) => `Rank #${r}` },
  'anime.info_title_jp': { fr: 'Titre JP',    en: 'JP Title' },
  'anime.info_type':     { fr: 'Type',        en: 'Type' },
  'anime.info_episodes': { fr: 'Épisodes',    en: 'Episodes' },
  'anime.info_duration': { fr: 'Durée',       en: 'Duration' },
  'anime.info_status':   { fr: 'Statut',      en: 'Status' },
  'anime.info_aired':    { fr: 'Diffusion',   en: 'Aired' },
  'anime.info_studio':   { fr: 'Studio',      en: 'Studio' },
  'anime.info_source':   { fr: 'Source',      en: 'Source' },
  'anime.info_season':   { fr: 'Saison',      en: 'Season' },
  'anime.info_popularity':{ fr: 'Popularité', en: 'Popularity' },
  'anime.status_airing':  { fr: 'En cours',   en: 'Airing' },
  'anime.status_finished':{ fr: 'Terminé',    en: 'Finished' },
  'anime.status_upcoming':{ fr: 'À venir',    en: 'Upcoming' },
  'anime.franchise':     { fr: '📺 Franchise',         en: '📺 Franchise' },
  'anime.franchise_loading': { fr: 'Chargement de la franchise…', en: 'Loading franchise…' },
  'anime.franchise_seasons': { fr: '📺 Saisons',   en: '📺 Seasons' },
  'anime.franchise_movies':  { fr: '🎬 Films',      en: '🎬 Movies' },
  'anime.franchise_ova':     { fr: 'OVA',           en: 'OVA' },
  'anime.franchise_special': { fr: 'Spéciaux',      en: 'Specials' },
  'anime.franchise_spinoff': { fr: '🌀 Spin-offs',  en: '🌀 Spin-offs' },
  'watch.removed':       { fr: 'Suivi retiré',                              en: 'Tracking removed' },
  'watch.label_watching':  { fr: 'En cours ▶',   en: 'Watching ▶' },
  'watch.label_completed': { fr: 'Terminé ✓',    en: 'Completed ✓' },
  'watch.label_plan':      { fr: 'À regarder 🔖', en: 'Plan to watch 🔖' },
  'rating.saved':  { fr: (n) => `Note enregistrée : ${n}/10 ⭐`, en: (n) => `Rating saved: ${n}/10 ⭐` },
  'rating.deleted':{ fr: 'Note supprimée', en: 'Rating removed' },
  'anime.episodes_label': { fr: 'Épisodes', en: 'Episodes' },

/* Export pour usage dans main.js / anime.js etc. */
window.t        = t;
window.VA_LANG  = VA_LANG;
window.VA_setLang   = VA_setLang;
window.VA_toggleLang = VA_toggleLang;
