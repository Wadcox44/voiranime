/* =========================
   CONFIG API
========================= */
const BASE_URL = "https://api.jikan.moe/v4";

/* =========================
   DOM
========================= */
const searchInput = document.getElementById("searchInput");
const resultsContainer = document.getElementById("results");
const trendingContainer = document.getElementById("trending");

/* =========================
   INIT
========================= */
document.addEventListener("DOMContentLoaded", () => {
  loadTrending();
});

/* =========================
   SEARCH
========================= */
searchInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query) {
      searchAnime(query);
    }
  }
});

/* =========================
   SEARCH FUNCTION
========================= */
async function searchAnime(query) {
  resultsContainer.innerHTML = "<p>Chargement...</p>";

  try {
    const res = await fetch(`${BASE_URL}/anime?q=${query}&limit=12`);
    const data = await res.json();

    displayAnimes(data.data, resultsContainer);

  } catch (error) {
    console.error(error);
    resultsContainer.innerHTML = "<p>Erreur de chargement</p>";
  }
}

/* =========================
   TRENDING
========================= */
async function loadTrending() {
  try {
    const res = await fetch(`${BASE_URL}/top/anime?limit=12`);
    const data = await res.json();

    displayAnimes(data.data, trendingContainer);

  } catch (error) {
    console.error(error);
    trendingContainer.innerHTML = "<p>Erreur trending</p>";
  }
}

/* =========================
   DISPLAY FUNCTION
========================= */
function displayAnimes(animes, container) {
  container.innerHTML = "";

  animes.forEach(anime => {
    const card = document.createElement("div");
    card.classList.add("card");

    card.innerHTML = `
      <img src="${anime.images.jpg.image_url}" alt="${anime.title}">
      <div class="info">
        <h3>${anime.title}</h3>
        <p>⭐ ${anime.score || "N/A"}</p>
      </div>
    `;

    card.addEventListener("click", () => {
      window.location.href = `anime.html?id=${anime.mal_id}`;
    });

    container.appendChild(card);
  });
}
