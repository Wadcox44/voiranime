/* ═══════════════════════════════════════════════════════════════════
   VoirAnime — i18n.js v2.0
   Architecture : Pi locale → navigator.language → localStorage → 'en'
   - Dictionnaire complet EN + FR
   - Interpolation : t('key', {name: 'Naruto'}) → "Welcome, Naruto!"
   - applyTranslations() : DOM complet (text, placeholder, aria-label, title)
   - updateLang() : sans reload, mise à jour dynamique
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

/* ──────────────────────────────────────
   1. DICTIONNAIRE COMPLET
────────────────────────────────────── */
const VA_DICT = {

  en: {
    /* ── Navigation ── */
    'nav.tagline':        'Discover differently.',
    'nav.home':           'Home',
    'nav.catalogue':      'Catalogue',
    'nav.duels':          '⚔ Duels',
    'nav.news':           '📰 News',
    'nav.support':        '💜 Support',
    'nav.search':         'Search',
    'nav.my_profile':     'My profile',

    /* ── Search ── */
    'search.placeholder': 'Title, genre, character…',
    'search.results':     'Search results',
    'search.close':       '✕ Close',
    'search.empty':       'No results. Try another title.',
    'search.loading':     'Searching…',

    /* ── Anime du jour ── */
    'adj.label':          'Anime of the day',
    'adj.watch':          'Watch →',
    'adj.shuffle':        'Another suggestion',
    'adj.shuffle_title':  'Another suggestion',

    /* ── Mood / Ambiance ── */
    'mood.eyebrow':       'What mood are you in tonight?',
    'mood.all':           'Explore all',
    'mood.action':        'Adrenaline',
    'mood.romance':       'Romance',
    'mood.dark':          'Dark universe',
    'mood.comedy':        'Good vibes',
    'mood.scifi':         'Sci-fi & Mecha',
    'mood.psychological': 'Mind-bending',
    'mood.slice':         'Zen & Calm',
    'mood.aria':          'Filter by mood',

    /* ── Zone separators ── */
    'zone1.title':        'What is alive right now',
    'zone2.title':        'What has stood the test of time',
    'zone3.title':        'The cinematic experience',
    'zone.season_current':'Current season',
    'zone.realtime':      'Real-time',

    /* ── Sections ── */
    'section.for_you':    '✨ For you',
    'section.popular':    '🔥 Most popular',
    'section.top25':      'Top 25',
    'section.top':        '⭐ Top rated',
    'section.airing':     '📡 Airing',
    'section.movies':     '🎬 Anime movies',
    'section.series':     '📺 Anime series',
    'section.ova':        '🎞 OVA',
    'section.ona':        '🌐 ONA',
    'section.trending':   '📈 Trending on VoirAnime',

    /* ── Catalogue ── */
    'cat.title':          'Anime',
    'cat.subtitle':       'Explore all anime — filter, sort, discover.',
    'cat.search_placeholder': 'Search an anime…',
    'cat.search_btn':     'Search',
    'cat.filters_btn':    'Filters',
    'cat.empty':          'No anime found for these criteria.',
    'cat.empty_hint':     'Try other filters!',
    'cat.reset':          '↺ Reset',
    'cat.results':        '{n} results',
    'cat.page_results':   'Page {page} · {n} results shown',

    /* Catalogue — Filter labels */
    'cat.label.genre':    'Genre',
    'cat.label.type':     'Type',
    'cat.label.status':   'Status',
    'cat.label.score':    'Min. score',
    'cat.label.year':     'Year',
    'cat.label.reset':    'Reset',

    /* Catalogue — Genre options */
    'cat.genre.all':      'All',
    'cat.type.all':       'All',
    'cat.type.tv':        'Series',
    'cat.type.movie':     'Movie',
    'cat.type.ova':       'OVA',
    'cat.type.ona':       'ONA',
    'cat.type.special':   'Special',
    'cat.status.all':     'All',
    'cat.status.airing':  'Airing',
    'cat.status.complete':'Completed',
    'cat.status.upcoming':'Upcoming',
    'cat.year.all':       'All',

    /* ── Sort ── */
    'sort.label':         'Sort by',
    'sort.popularity':    'Popularity',
    'sort.score':         'Score',
    'sort.title':         'Title A–Z',
    'sort.date':          'Release date',
    'sort.rank':          'Rank',

    /* ── Favorites ── */
    'fav.added':          '❤ {title} added to favorites',
    'fav.removed':        '💔 {title} removed from favorites',
    'fav.btn_aria':       'Add to favorites',
    'fav.limit':          '⚠ Favorites limit reached (20). Go Premium for unlimited!',

    /* ── News ── */
    'news.title':         '📰 Anime news',
    'news.subtitle':      'Anime world news — curated sources',
    'news.tab.global':    '🌍 Global news',
    'news.tab.alerts':    '⭐ My alerts',
    'news.source.all':    'All',
    'news.loading':       'Loading articles…',
    'news.rss_error':     'RSS feed unavailable',
    'news.empty':         'No articles available right now.',
    'news.load_error':    'Error loading RSS feeds.',
    'news.retry':         'Retry',
    'news.alerts_empty':  'Add favorites to receive alerts.',
    'news.alert_active':  'Alerts enabled',
    'news.premium.title': 'Personalized news — Premium',
    'news.premium.desc':  'Get alerts when your favorite anime release new episodes, season announcements, and an upcoming release calendar.',
    'news.premium.monthly':'Monthly — 1.99 Pi/month',
    'news.premium.annual': 'Annual — 19.99 Pi/year',
    'news.premium.saving': '2 months free',

    /* ── Support / Soutenir ── */
    'support.title':      'Support VoirAnime',
    'support.subtitle':   '100% independent project — donations cover server costs.',
    'support.amounts_title': 'Choose an amount (Pi)',
    'support.curious':    'Curious',
    'support.contributor':'Contributor',
    'support.supporter':  'Supporter',
    'support.pillar':     'Pillar',
    'support.popular':    'Popular',
    'support.top':        '★ Top',
    'support.custom_label': 'Custom amount',
    'support.custom_placeholder': 'Other amount',
    'support.btn':        'Send {amount} Pi via Pi Wallet',
    'support.sending':    'Processing payment…',
    'support.approve':    'Server approval…',
    'support.sign':       '✅ Approved — sign in your Pi wallet',
    'support.finalizing': 'Finalizing…',
    'support.cancelled':  'Donation cancelled.',
    'support.thank_you':  'Thank you for your support 🙏',
    'support.close':      'Close',
    'support.pioneers':   'Our Pioneers — Thank you 💜',
    'support.pi_browser': '⚠️ Open VoirAnime in Pi Browser to pay with Pi.',
    'support.choose_amount': '⚠️ Please choose an amount.',
    'support.pi_auth_error': '❌ Pi authentication error.',

    /* ── Duel ── */
    'duel.loading':       'Loading duel…',
    'duel.title':         'Which do you prefer?',
    'duel.subtitle':      'Vote for your favorite — see what others think.',
    'duel.hint':          '← → or click',
    'duel.vote':          'Vote for this one',
    'duel.view_anime':    'View anime ›',
    'duel.leaderboard':   '🏆 Popular ranking',
    'duel.lb_empty':      'Play a few duels to see the ranking!',
    'duel.lb_show':       'Show ▼',
    'duel.lb_hide':       'Hide ▲',
    'duel.first_vote':    'First vote!',
    'duel.votes':         '{n} vote',
    'duel.votes_plural':  '{n} votes',
    'duel.agree':         '✅ You <strong>agree</strong> with <strong>{pct}%</strong> of voters — <em>{title}</em> dominates!',
    'duel.disagree':      '🤔 You go <strong>against the majority</strong> — only <strong>{pct}%</strong> voted like you.',
    'duel.played':        '{n} duel played',
    'duel.played_plural': '{n} duels played',
    'duel.wins':          '{n} win',
    'duel.wins_plural':   '{n} wins',
    'duel.milestone.5':   '5 duels 🔥 On fire!',
    'duel.milestone.10':  '10 duels 💪 Incredible!',
    'duel.milestone.25':  '25 duels 👑 Legend!',
    'duel.connection_error': '⚠ Cannot load anime. Check your connection.',
    'duel.start_error':   '⚠ Cannot start the duel.',
    'duel.result.podium': '🏆 Duel result',
    'duel.result.votes_pct': '{pct}% of votes',
    'duel.expires_in_d':  'Expires in {d}d {h}h',
    'duel.expires_in_h':  'Expires in {h}h {m}min',
    'duel.expires_in_m':  'Expires in {m} min',
    'duel.expired':       'Expired',

    /* ── Profile ── */
    'profile.title':      'My Profile',
    'profile.since_today':'Member since today',
    'profile.since_day':  'Member for 1 day',
    'profile.since_days': 'Member for {n} days',
    'profile.stat.visited':   'Visited',
    'profile.stat.favorites': 'Favorites',
    'profile.stat.planwatch': 'Plan to watch',
    'profile.stat.watching':  'Watching',
    'profile.stat.completed': 'Completed',
    'profile.stat.hours':     'Hours',
    'profile.stat.activedays':'Active days',
    'profile.stat.progress':  'Progress',
    'profile.avatar_title':   'Change avatar',
    'profile.avatar_modal_title': 'Choose your avatar',
    'profile.avatar_updated': 'Avatar updated!',
    'profile.contact':    '✉ Contact us',
    'profile.contact_name':'Name',
    'profile.contact_email':'Email',
    'profile.contact_msg':'Message',
    'profile.contact_name_ph':'Your name',
    'profile.contact_email_ph':'your@email.com',
    'profile.contact_msg_ph':'Your message…',
    'profile.contact_send':'Send ✉',
    'profile.contact_sending':'Sending…',
    'profile.contact_sent':'✅ Message sent!',
    'profile.contact_error':'❌ Error — please retry',
    'profile.contact_network':'❌ Network error',
    'profile.contact_btn_title': 'Contact us',

    /* ── Premium subscription ── */
    'premium.active':         '⭐ Premium active',
    'premium.monthly_label':  'Monthly',
    'premium.annual_label':   'Annual',
    'premium.expires_soon':   '⚠ Expires in {n} day',
    'premium.expires_soon_pl':'⚠ Expires in {n} days — remember to renew',
    'premium.expires_today':  '⚠ Expires today',
    'premium.see_perks':      'See benefits ▼',
    'premium.hide_perks':     'Hide ▲',
    'premium.perk.favs':      '❤ Unlimited favorites',
    'premium.perk.stats':     '📊 Detailed stats',
    'premium.perk.early':     '⚡ Early access',
    'premium.perk.reorder':   '↕ Reorder',
    'premium.renew':          'Renew',
    'premium.cancel':         'Cancel',
    'premium.expired_tag':    'Subscription expired',
    'premium.upgrade':        '⭐ Go Premium',
    'premium.feature.favs':   '❤ Favorites',
    'premium.feature.stats':  '📊 Detailed stats',
    'premium.feature.early':  '⚡ Early access',
    'premium.feature.reorder':'↕ Reorder',
    'premium.feature.news':   '🔔 Personal news',
    'premium.free.favs':      '20 max',
    'premium.free.early':     '+15d',
    'premium.free.no':        '✕',
    'premium.yes':            '✓',
    'premium.yes_unlimited':  '✓ Unlimited',
    'premium.yes_immediate':  '✓ Immediate',
    'premium.best_offer':     'Best offer',
    'premium.launch':         '🔥 Launch offer',
    'premium.subscribe':      'Subscribe',
    'premium.cancel_confirm': "Cancel subscription? You keep access until expiration.",
    'premium.activated':      '✅ Premium subscription activated! Welcome 🎉',
    'premium.activation_pending': 'Payment received — activation in progress…',
    'premium.feature_label':  'Feature',
    'premium.free_label':     'Free',
    'premium.pi_error':       "⚠️ Open VoirAnime in Pi Browser to subscribe.",
    'premium.plan.monthly':   '1.99 Pi/month',
    'premium.plan.annual':    '19.99 Pi/year',
    'premium.per_month':      'per month',
    'premium.per_year':       'per year',
    'premium.2months_free':   '2 months free',
    'premium.details':        '🎯 Premium details',
    'premium.top3':           '🔥 Top 3 anime',
    'premium.top_genres':     '🎯 Favorite genres',
    'premium.genres_empty':   'Visit more anime to unlock your genres!',
    'premium.top_empty':      'Visit anime to unlock!',

    /* ── Footer ── */
    'footer.no_video':    'No video is hosted on this site.',

    /* ── Toast / System ── */
    'toast.loading':      'Loading…',
    'toast.error':        'An error occurred.',
    'toast.offline':      '📡 You are offline.',
  },

  fr: {
    /* ── Navigation ── */
    'nav.tagline':        'Découvre autrement.',
    'nav.home':           'Accueil',
    'nav.catalogue':      'Catalogue',
    'nav.duels':          '⚔ Duels',
    'nav.news':           '📰 News',
    'nav.support':        '💜 Soutenir',
    'nav.search':         'Rechercher',
    'nav.my_profile':     'Mon profil',

    /* ── Search ── */
    'search.placeholder': 'Titre, genre, personnage…',
    'search.results':     'Résultats de recherche',
    'search.close':       '✕ Fermer',
    'search.empty':       'Aucun résultat. Essaie un autre titre.',
    'search.loading':     'Recherche en cours…',

    /* ── Anime du jour ── */
    'adj.label':          'Anime du jour',
    'adj.watch':          'Voir l\'anime →',
    'adj.shuffle':        'Autre suggestion',
    'adj.shuffle_title':  'Autre suggestion',

    /* ── Mood / Ambiance ── */
    'mood.eyebrow':       'Dans quel état d\'esprit tu es ce soir ?',
    'mood.all':           'Tout explorer',
    'mood.action':        'Adrénaline',
    'mood.romance':       'Romance',
    'mood.dark':          'Univers Sombre',
    'mood.comedy':        'Bonne Humeur',
    'mood.scifi':         'Sci-fi & Mecha',
    'mood.psychological': 'Mind-bending',
    'mood.slice':         'Zen & Calme',
    'mood.aria':          'Filtrer par ambiance',

    /* ── Zone separators ── */
    'zone1.title':        'Ce qui vit en ce moment',
    'zone2.title':        'Ce qui a traversé le temps',
    'zone3.title':        'L\'expérience cinématique',
    'zone.season_current':'Saison en cours',
    'zone.realtime':      'Temps réel',

    /* ── Sections ── */
    'section.for_you':    '✨ Pour toi',
    'section.popular':    '🔥 Les plus populaires',
    'section.top25':      'Top 25',
    'section.top':        '⭐ Mieux notés',
    'section.airing':     '📡 En cours',
    'section.movies':     '🎬 Films anime',
    'section.series':     '📺 Séries anime',
    'section.ova':        '🎞 OVA',
    'section.ona':        '🌐 ONA',
    'section.trending':   '📈 Trending sur VoirAnime',

    /* ── Catalogue ── */
    'cat.title':          'Anime',
    'cat.subtitle':       'Explore tous les animes — filtre, trie, découvre.',
    'cat.search_placeholder': 'Rechercher un anime…',
    'cat.search_btn':     'Rechercher',
    'cat.filters_btn':    'Filtres',
    'cat.empty':          'Aucun anime trouvé pour ces critères.',
    'cat.empty_hint':     'Essaie d\'autres filtres !',
    'cat.reset':          '↺ Réinitialiser',
    'cat.results':        '{n} résultats',
    'cat.page_results':   'Page {page} · {n} résultats affichés',

    /* Catalogue — Filter labels */
    'cat.label.genre':    'Genre',
    'cat.label.type':     'Type',
    'cat.label.status':   'Statut',
    'cat.label.score':    'Score min.',
    'cat.label.year':     'Année',
    'cat.label.reset':    'Réinitialiser',

    /* Catalogue — Options */
    'cat.genre.all':      'Tous',
    'cat.type.all':       'Tous',
    'cat.type.tv':        'Série',
    'cat.type.movie':     'Film',
    'cat.type.ova':       'OVA',
    'cat.type.ona':       'ONA',
    'cat.type.special':   'Spécial',
    'cat.status.all':     'Tous',
    'cat.status.airing':  'En cours',
    'cat.status.complete':'Terminé',
    'cat.status.upcoming':'À venir',
    'cat.year.all':       'Toutes',

    /* ── Sort ── */
    'sort.label':         'Trier par',
    'sort.popularity':    'Popularité',
    'sort.score':         'Score',
    'sort.title':         'Titre A–Z',
    'sort.date':          'Date de sortie',
    'sort.rank':          'Rang',

    /* ── Favorites ── */
    'fav.added':          '❤ {title} ajouté aux favoris',
    'fav.removed':        '💔 {title} retiré des favoris',
    'fav.btn_aria':       'Ajouter aux favoris',
    'fav.limit':          '⚠ Limite de favoris atteinte (20). Passe Premium pour des favoris illimités !',

    /* ── News ── */
    'news.title':         '📰 News anime',
    'news.subtitle':      'Actualités du monde de l\'anime — sources sélectionnées',
    'news.tab.global':    '🌍 Actu globale',
    'news.tab.alerts':    '⭐ Mes alertes',
    'news.source.all':    'Tous',
    'news.loading':       'Chargement des articles…',
    'news.rss_error':     'Flux RSS indisponible',
    'news.empty':         'Aucun article disponible pour le moment.',
    'news.load_error':    'Erreur de chargement des flux RSS.',
    'news.retry':         'Réessayer',
    'news.alerts_empty':  'Ajoute des favoris pour recevoir des alertes.',
    'news.alert_active':  'Alertes activées',
    'news.premium.title': 'News personnalisées — Premium',
    'news.premium.desc':  'Reçois des alertes quand tes animés favoris sortent de nouveaux épisodes, des annonces de saisons, et un calendrier des sorties à venir.',
    'news.premium.monthly':'Mensuel — 1.99 Pi/mois',
    'news.premium.annual': 'Annuel — 19.99 Pi/an',
    'news.premium.saving': '2 mois offerts',

    /* ── Support / Soutenir ── */
    'support.title':      'Soutenir VoirAnime',
    'support.subtitle':   'Projet 100% indépendant — les dons couvrent les coûts du serveur.',
    'support.amounts_title': 'Choisir un montant (Pi)',
    'support.curious':    'Curieux',
    'support.contributor':'Contributeur',
    'support.supporter':  'Soutien',
    'support.pillar':     'Pilier',
    'support.popular':    'Populaire',
    'support.top':        '★ Top',
    'support.custom_label': 'Montant libre',
    'support.custom_placeholder': 'Autre montant',
    'support.btn':        'Envoyer {amount} Pi via Pi Wallet',
    'support.sending':    'Paiement en cours…',
    'support.approve':    'Approbation serveur…',
    'support.sign':       '✅ Approuvé — signe dans ton wallet Pi',
    'support.finalizing': 'Finalisation…',
    'support.cancelled':  'Don annulé.',
    'support.thank_you':  'Merci pour ton soutien 🙏',
    'support.close':      'Fermer',
    'support.pioneers':   'Nos Pioneers — Merci à vous 💜',
    'support.pi_browser': '⚠️ Ouvre VoirAnime dans Pi Browser pour payer en Pi.',
    'support.choose_amount': '⚠️ Choisis un montant.',
    'support.pi_auth_error': '❌ Erreur d\'authentification Pi.',

    /* ── Duel ── */
    'duel.loading':       'Chargement du duel…',
    'duel.title':         'Lequel préfères-tu ?',
    'duel.subtitle':      'Vote pour ton favori — vois ce que pensent les autres.',
    'duel.hint':          '← → ou clic',
    'duel.vote':          'Voter pour lui',
    'duel.view_anime':    'Voir l\'anime ›',
    'duel.leaderboard':   '🏆 Classement populaire',
    'duel.lb_empty':      'Joue quelques duels pour voir le classement !',
    'duel.lb_show':       'Afficher ▼',
    'duel.lb_hide':       'Masquer ▲',
    'duel.first_vote':    'Premier vote !',
    'duel.votes':         '{n} vote',
    'duel.votes_plural':  '{n} votes',
    'duel.agree':         '✅ Tu es <strong>d\'accord</strong> avec <strong>{pct}%</strong> des votants — <em>{title}</em> domine !',
    'duel.disagree':      '🤔 Tu es <strong>contre</strong> la majorité — seulement <strong>{pct}%</strong> ont voté comme toi.',
    'duel.played':        '{n} duel joué',
    'duel.played_plural': '{n} duels joués',
    'duel.wins':          '{n} victoire',
    'duel.wins_plural':   '{n} victoires',
    'duel.milestone.5':   '5 duels 🔥 En feu !',
    'duel.milestone.10':  '10 duels 💪 Incroyable !',
    'duel.milestone.25':  '25 duels 👑 Légende !',
    'duel.connection_error': '⚠ Impossible de charger les animés. Vérifie ta connexion.',
    'duel.start_error':   '⚠ Impossible de lancer le duel.',
    'duel.result.podium': '🏆 Résultat du duel',
    'duel.result.votes_pct': '{pct}% des votes',
    'duel.expires_in_d':  'Expire dans {d}j {h}h',
    'duel.expires_in_h':  'Expire dans {h}h {m}min',
    'duel.expires_in_m':  'Expire dans {m} min',
    'duel.expired':       'Terminé',

    /* ── Profile ── */
    'profile.title':      'Mon Profil',
    'profile.since_today':'Membre depuis aujourd\'hui',
    'profile.since_day':  'Membre depuis 1 jour',
    'profile.since_days': 'Membre depuis {n} jours',
    'profile.stat.visited':   'Visités',
    'profile.stat.favorites': 'Favoris',
    'profile.stat.planwatch': 'À voir',
    'profile.stat.watching':  'En cours',
    'profile.stat.completed': 'Terminés',
    'profile.stat.hours':     'Heures',
    'profile.stat.activedays':'Jours actifs',
    'profile.stat.progress':  'Progression',
    'profile.avatar_title':   'Changer d\'avatar',
    'profile.avatar_modal_title': 'Choisir ton avatar',
    'profile.avatar_updated': 'Avatar mis à jour !',
    'profile.contact':    '✉ Nous contacter',
    'profile.contact_name':'Nom',
    'profile.contact_email':'Email',
    'profile.contact_msg':'Message',
    'profile.contact_name_ph':'Votre nom',
    'profile.contact_email_ph':'votre@email.com',
    'profile.contact_msg_ph':'Votre message…',
    'profile.contact_send':'Envoyer ✉',
    'profile.contact_sending':'Envoi…',
    'profile.contact_sent':'✅ Message envoyé !',
    'profile.contact_error':'❌ Erreur — réessaie',
    'profile.contact_network':'❌ Erreur réseau',
    'profile.contact_btn_title': 'Nous contacter',

    /* ── Premium subscription ── */
    'premium.active':         '⭐ Premium actif',
    'premium.monthly_label':  'Mensuel',
    'premium.annual_label':   'Annuel',
    'premium.expires_soon':   '⚠ Expire dans {n} jour',
    'premium.expires_soon_pl':'⚠ Expire dans {n} jours — pensez à renouveler',
    'premium.expires_today':  '⚠ Expire aujourd\'hui',
    'premium.see_perks':      'Voir les avantages ▼',
    'premium.hide_perks':     'Masquer ▲',
    'premium.perk.favs':      '❤ Favoris illimités',
    'premium.perk.stats':     '📊 Stats détaillées',
    'premium.perk.early':     '⚡ Accès anticipé',
    'premium.perk.reorder':   '↕ Réorganiser',
    'premium.renew':          'Renouveler',
    'premium.cancel':         'Annuler',
    'premium.expired_tag':    'Abonn. expiré',
    'premium.upgrade':        '⭐ Passer Premium',
    'premium.feature.favs':   '❤ Favoris',
    'premium.feature.stats':  '📊 Stats détaillées',
    'premium.feature.early':  '⚡ Accès anticipé',
    'premium.feature.reorder':'↕ Réorganiser',
    'premium.feature.news':   '🔔 News perso',
    'premium.free.favs':      '20 max',
    'premium.free.early':     '+15j',
    'premium.free.no':        '✕',
    'premium.yes':            '✓',
    'premium.yes_unlimited':  '✓ Illimités',
    'premium.yes_immediate':  '✓ Immédiat',
    'premium.best_offer':     'Meilleure offre',
    'premium.launch':         '🔥 Offre de lancement',
    'premium.subscribe':      'S\'abonner',
    'premium.cancel_confirm': "Annuler l'abonnement ? Tu gardes l'accès jusqu'à expiration.",
    'premium.activated':      '✅ Abonnement Premium activé ! Bienvenue 🎉',
    'premium.activation_pending': 'Paiement reçu — activation en cours…',
    'premium.feature_label':  'Fonctionnalité',
    'premium.free_label':     'Gratuit',
    'premium.pi_error':       "⚠️ Ouvre VoirAnime dans le Pi Browser pour t'abonner.",
    'premium.plan.monthly':   '1.99 Pi/mois',
    'premium.plan.annual':    '19.99 Pi/an',
    'premium.per_month':      'par mois',
    'premium.per_year':       'par an',
    'premium.2months_free':   '2 mois offerts',
    'premium.details':        '🎯 Détails Premium',
    'premium.top3':           '🔥 Top 3 animes',
    'premium.top_genres':     '🎯 Genres préférés',
    'premium.genres_empty':   'Visite plus d\'animés pour débloquer tes genres !',
    'premium.top_empty':      'Visite des animés pour débloquer !',

    /* ── Footer ── */
    'footer.no_video':    'Aucune vidéo n\'est hébergée sur ce site.',

    /* ── Toast / System ── */
    'toast.loading':      'Chargement…',
    'toast.error':        'Une erreur est survenue.',
    'toast.offline':      '📡 Tu es hors ligne.',
  },
};

/* ──────────────────────────────────────
   2. DÉTECTION DE LANGUE
   Priorité : Pi locale → localStorage → navigator.language → 'en'
────────────────────────────────────── */
const VA_LANG_KEY = 'VoirAnime_lang';
const VA_SUPPORTED = ['en', 'fr'];

function _detectLang() {
  // 1. Préférence manuelle de l'utilisateur (priorité absolue)
  const saved = localStorage.getItem(VA_LANG_KEY);
  if (saved && VA_SUPPORTED.includes(saved)) return saved;

  // 2. Langue Pi Network (si dans le Pi Browser)
  try {
    const piLocale = window.Pi?.userInfo?.locale
      || window.Pi?.currentUser?.locale
      || null;
    if (piLocale) {
      const piLang = piLocale.split('-')[0].toLowerCase();
      if (VA_SUPPORTED.includes(piLang)) return piLang;
    }
  } catch (_) {}

  // 3. Langue du navigateur
  const navLang = (navigator.language || navigator.userLanguage || 'en')
    .split('-')[0].toLowerCase();
  if (VA_SUPPORTED.includes(navLang)) return navLang;

  // 4. Fallback
  return 'en';
}

/* ──────────────────────────────────────
   3. API PUBLIQUE
────────────────────────────────────── */

/** Langue courante */
let VA_LANG = _detectLang();

/**
 * t(key, params?) — Traduit une clé avec interpolation optionnelle
 * @param {string} key
 * @param {Object} [params] — ex: { title: 'Naruto' } → remplace {title}
 * @returns {string}
 */
function t(key, params) {
  const dict = VA_DICT[VA_LANG] || VA_DICT['en'];
  let str = dict[key] ?? VA_DICT['en'][key] ?? key;

  if (params && typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, v);
    }
  }
  return str;
}

/**
 * setLang(lang) — Changement manuel de langue
 * Met à jour le DOM sans reload
 */
function setLang(lang) {
  if (!VA_SUPPORTED.includes(lang)) return;
  VA_LANG = lang;
  localStorage.setItem(VA_LANG_KEY, lang);

  // Ferme le menu langue si ouvert
  document.getElementById('langMenu')?.classList.remove('open');

  applyTranslations();
  _updateLangUI();

  // Dispatch un event pour que les scripts tiers puissent réagir
  document.dispatchEvent(new CustomEvent('va:langchange', { detail: { lang } }));
}

/**
 * applyTranslations() — Traduit tout le DOM visible
 * Ciblé : [data-i18n], [data-i18n-placeholder], [data-i18n-aria], [data-i18n-title]
 */
function applyTranslations() {
  const root = document;

  // ── Texte (innerHTML sécurisé si pas de HTML dans la traduction)
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    // Permet le HTML si la traduction contient des balises (ex: duel.agree)
    if (val.includes('<')) {
      el.innerHTML = val;
    } else {
      el.textContent = val;
    }
  });

  // ── Placeholder
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });

  // ── aria-label
  root.querySelectorAll('[data-i18n-aria]').forEach(el => {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });

  // ── title attribute
  root.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
  });

  // ── alt attribute
  root.querySelectorAll('[data-i18n-alt]').forEach(el => {
    el.setAttribute('alt', t(el.getAttribute('data-i18n-alt')));
  });

  // ── <html lang=""> + <title>
  document.documentElement.lang = VA_LANG;
  _updatePageTitle();
}

/** Met à jour le <title> de la page selon la page courante */
function _updatePageTitle() {
  const page = location.pathname.split('/').pop() || 'index.html';
  const titles = {
    'index.html':    VA_LANG === 'fr' ? 'VoirAnime — Ton portail anime' : 'VoirAnime — Your anime portal',
    'catalogue.html':VA_LANG === 'fr' ? 'VoirAnime — Catalogue' : 'VoirAnime — Catalogue',
    'news.html':     VA_LANG === 'fr' ? 'VoirAnime — News anime' : 'VoirAnime — Anime news',
    'soutenir.html': VA_LANG === 'fr' ? 'VoirAnime — Soutenir' : 'VoirAnime — Support us',
    'duel.html':     VA_LANG === 'fr' ? 'VoirAnime — Duels' : 'VoirAnime — Duels',
    'profile.html':  VA_LANG === 'fr' ? 'VoirAnime — Profil' : 'VoirAnime — Profile',
  };
  if (titles[page]) document.title = titles[page];
}

/** Met à jour le bouton de langue dans la navbar */
function _updateLangUI() {
  const btn = document.getElementById('langBtn');
  if (btn) btn.textContent = VA_LANG === 'fr' ? '🇫🇷' : '🇬🇧';
}

/* ──────────────────────────────────────
   4. DROPDOWN LANGUE
────────────────────────────────────── */
window.toggleLangMenu = function(event) {
  if (event) event.stopPropagation();
  document.getElementById('langMenu')?.classList.toggle('open');
};

// Ferme le menu au clic en dehors
document.addEventListener('click', () => {
  document.getElementById('langMenu')?.classList.remove('open');
});

/* ──────────────────────────────────────
   5. INIT AU CHARGEMENT DU DOM
────────────────────────────────────── */
(function init() {
  // Attendre Pi SDK si disponible (il se charge après i18n.js parfois)
  function _run() {
    VA_LANG = _detectLang();
    applyTranslations();
    _updateLangUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else {
    _run();
  }

  // Re-détection différée si Pi SDK se charge après
  setTimeout(() => {
    const piLang = _getPiLang();
    if (piLang && !localStorage.getItem(VA_LANG_KEY)) {
      // Pas de préférence manuelle → on applique la langue Pi si différente
      if (piLang !== VA_LANG) {
        VA_LANG = piLang;
        applyTranslations();
        _updateLangUI();
      }
    }
  }, 1500);
})();

function _getPiLang() {
  try {
    const piLocale = window.Pi?.userInfo?.locale
      || window.Pi?.currentUser?.locale
      || null;
    if (!piLocale) return null;
    const piLang = piLocale.split('-')[0].toLowerCase();
    return VA_SUPPORTED.includes(piLang) ? piLang : null;
  } catch (_) { return null; }
}

/* ──────────────────────────────────────
   6. EXPORTS GLOBAUX
   (compatible scripts non-module)
────────────────────────────────────── */
window.VA_LANG      = VA_LANG;
window.t            = t;
window.setLang      = setLang;
window.applyTranslations = applyTranslations;

// Compat avec l'ancienne API
window.getLang      = () => VA_LANG;
window.changeLang   = setLang;
