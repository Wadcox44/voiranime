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
   PLAY TRAILER (UNMUTE)
========================= */
function playTrailer() {
  const iframe = document.querySelector(".anime-hero-video iframe");

  if (iframe) {
    iframe.src = iframe.src.replace("mute=1", "mute=0");
  }
}

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
      <div class="anime-page">

        <!-- HERO VIDEO -->
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

            <button class="btn primary" onclick="playTrailer()">
              ▶ Play
            </button>

          </div>

        </div>

      </div>
    `;

  } catch (error) {
    console.error("ERREUR FETCH :", error);
    container.innerHTML = "<p>Erreur de chargement API</p>";
  }
}
