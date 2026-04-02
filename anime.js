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
document.addEventListener("DOMContentLoaded", () => {
  if (animeId) {
    loadAnime(animeId);
  }
});

async function loadAnime(id) {
  try {
    const res = await fetch(`${BASE_URL}/anime/${id}/full`);
    const data = await res.json();

    const anime = data.data;

    container.innerHTML = `
      <div class="anime-hero">

        <img class="anime-poster" src="${anime.images.jpg.large_image_url}" />

        <div class="anime-info">

          <h1>${anime.title}</h1>

          <p class="score">⭐ ${anime.score || "N/A"}</p>

          <p class="genres">
            ${anime.genres.map(g => g.name).join(" • ")}
          </p>

          <p class="synopsis">
            ${anime.synopsis || "Pas de synopsis disponible."}
          </p>

          <a class="btn" href="${anime.url}" target="_blank">
            Voir sur source officielle
          </a>

        </div>

      </div>
    `;

  } catch (error) {
    console.error(error);
    container.innerHTML = "<p>Erreur de chargement</p>";
  }
}
