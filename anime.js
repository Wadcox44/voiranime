/* =========================
   API
========================= */
const BASE_URL = "https://api.jikan.moe/v4";

/* =========================
   GET ID FROM URL
========================= */
const params = new URLSearchParams(window.location.search);
const animeId = params.get("id");

const container = document.getElementById("animeContainer");

console.log("animeId =", animeId);
console.log("container =", container);

if (!animeId) {
  container.innerHTML = "<p>Erreur : aucun anime sélectionné</p>";
} else {
  loadAnime(animeId);
}

/* =========================
   LOAD ANIME
========================= */
/* =========================
   LOAD ANIME
========================= */
async function loadAnime(id) {
  console.log("loadAnime lancé avec id:", id);

  try {
    const res = await fetch(`${BASE_URL}/anime/${id}/full`);
    const data = await res.json();

    console.log("DATA API =", data);

    const anime = data.data;

    if (!anime) {
      container.innerHTML = "<p>Erreur : données anime introuvables</p>";
      return;
    }

    const trailerUrl = anime.trailer?.embed_url;

    container.innerHTML = `
      <div class="hero">

        <!-- BACKGROUND VIDEO -->
        <div class="hero-bg">
          ${
            trailerUrl
              ? `<iframe 
                  src="${trailerUrl}?autoplay=1&mute=1&controls=0&loop=1"
                  frameborder="0"
                  allow="autoplay; encrypted-media"
                  allowfullscreen>
                </iframe>`
              : `<img src="${anime.images.jpg.large_image_url}" />`
          }

          <div class="overlay"></div>
        </div>

        <!-- HERO CONTENT -->
        <div class="hero-content">

          <h1>${anime.title}</h1>

          <p class="meta">
            ⭐ ${anime.score || "N/A"} • 
            ${anime.episodes || "?"} épisodes
          </p>

          <p class="genres">
            ${anime.genres.map(g => g.name).join(" • ")}
          </p>

          <div class="buttons">
            <a class="btn primary" href="${anime.url}" target="_blank">▶ Play</a>
          </div>

          <p class="synopsis">
            ${anime.synopsis ? anime.synopsis.substring(0, 500) + "..." : ""}
          </p>

        </div>

      </div>
    `;

  } catch (error) {
    console.error("ERREUR FETCH :", error);
    container.innerHTML = "<p>Erreur de chargement API</p>";
  }
}

    <!-- BACKGROUND VIDEO -->
    <div class="hero-bg">
      ${
        trailerUrl
          ? `<iframe 
              src="${trailerUrl}?autoplay=1&mute=1&controls=0&loop=1"
              frameborder="0"
              allow="autoplay; encrypted-media"
              allowfullscreen>
            </iframe>`
          : `<img src="${anime.images.jpg.large_image_url}" />`
      }

      <div class="overlay"></div>
    </div>

    <!-- HERO CONTENT -->
    <div class="hero-content">

      <h1>${anime.title}</h1>

      <p class="meta">
        ⭐ ${anime.score || "N/A"} • 
        ${anime.episodes || "?"} épisodes
      </p>

      <p class="genres">
        ${anime.genres.map(g => g.name).join(" • ")}
      </p>

      <div class="buttons">
        <a class="btn primary" href="${anime.url}" target="_blank">▶ Play</a>
        <button class="btn secondary" onclick="translateSynopsis()">🌍 Traduire</button>
      </div>

      <p class="synopsis">
        ${anime.synopsis ? anime.synopsis.substring(0, 500) + "..." : ""}
      </p>

    </div>

  </div>
`;
        <!-- CONTENT -->
        <div class="anime-hero-content">

          <img class="poster" src="${anime.images.jpg.large_image_url}" />

          <div class="info">

            <h1>${anime.title}</h1>

            <p class="score">⭐ ${anime.score || "N/A"}</p>

            <p class="genres">
              ${anime.genres.map(g => g.name).join(" • ")}
            </p>

            <p class="synopsis">
              ${anime.synopsis ? anime.synopsis.substring(0, 600) + "..." : "Pas de synopsis disponible."}
            </p>

            <a class="btn" href="${anime.url}" target="_blank">
              Voir source officielle
            </a>

          </div>

        </div>

      </div>
    `;

  } catch (error) {
    console.error(error);
    container.innerHTML = "<p>Erreur de chargement</p>";
  }
}
