const I18N = {
  lang: "en",
  cache: {},      // cache global par langue
  dict: {},       // dictionnaire actif
  fallback: "en",

  files: [
    "common.json",
    "navigation.json",
    "anime.json",
    "user.json"
  ],

  async init(lang = "en") {
    this.lang = lang;

    // charge langue demandée
    this.dict = await this.loadLang(lang);

    // charge fallback EN si différent
    if (lang !== this.fallback) {
      this.fallbackDict = await this.loadLang(this.fallback);
    }

    console.log("[i18n] loaded:", lang);
  },

  async loadLang(lang) {
    if (this.cache[lang]) return this.cache[lang];

    const data = await Promise.all(
      this.files.map(file =>
        fetch(`/locales/${lang}/${file}`).then(r => r.json())
      )
    );

    const merged = Object.assign({}, ...data);

    this.cache[lang] = merged;
    return merged;
  },

  t(key, params = null) {
    let value =
      this.dict[key] ??
      this.fallbackDict?.[key] ??
      key;

    // interpolation {0}, {1}, {n}, {title}...
    if (params) {
      Object.keys(params).forEach(k => {
        value = value.replaceAll(`{${k}}`, params[k]);
      });

      // support {0}, {1}
      if (Array.isArray(params)) {
        params.forEach((v, i) => {
          value = value.replaceAll(`{${i}}`, v);
        });
      }
    }

    return value;
  },

  setLang(lang) {
    return this.init(lang);
  }
};
