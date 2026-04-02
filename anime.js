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

/* =========================
   LOAD ANIME
========================= */
async function loadAnime(id) {
  try {
    const res = await fetch(`${BASE_URL}/anime/${id}/full`);
    const data = await res.json();
    const anime = data.data;

    const trailerUrl = anime.trailer?.embed_url;

    container.innerHTML = `
      <div class="anime-page">

        <!-- HERO TRAILER -->
        <div class="anime-hero-video">

          ${
            trailerUrl
              ? `<iframe 
                  src="${trailerUrl}?autoplay=1&mute=1"
                  frameborder="0"
                  allow="autoplay; encrypted-media"
                  allowfullscreen>
                </iframe>`
              : `<img src="${anime.images.jpg.large_image_url}" />`
          }

        </div>

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
