import { searchWikimedia, fetchCategoryMonkeys } from "./discovery-service.js";

const VIEW_MAIN = document.getElementById("viewMain");
const VIEW_DISCOVERY = document.getElementById("viewDiscovery");
const BTN_TOGGLE_DISCOVERY = document.getElementById("btnToggleDiscovery");
const BTN_SEARCH = document.getElementById("btnSearch");
const BTN_DISCOVER_CATEGORY = document.getElementById("btnDiscoverCategory");
const BTN_BACK = document.getElementById("btnBack");
const SEARCH_QUERY = document.getElementById("searchQuery");
const DISCOVERY_RESULTS = document.getElementById("discoveryResults");

const IMG_EL = document.getElementById("img");
const LOADING = document.getElementById("loading");
const TITLE = document.getElementById("imgTitle");
const SOURCE = document.getElementById("imgSource");
const IMG_OPEN_LINK = document.getElementById("imgOpenLink");
const BTN_OPEN_IMAGE = document.getElementById("btnOpenImage");
const LICENSE = document.getElementById("licenseBox");
const STATUS = document.getElementById("status");

const BTN_NEXT = document.getElementById("btnNext");
const BTN_FAV = document.getElementById("btnFav");
const BTN_CLEAR = document.getElementById("btnClear");
const ONLY_CC0 = document.getElementById("onlyCC0");
const CACHE_COUNT = document.getElementById("cacheCount");
const APP_TITLE = document.getElementById("appTitle");
const ANIMAL_BTNS = document.querySelectorAll(".animal-btn");

let currentAnimal = "monkey";

const FAV_KEY = "monkey_favs_v1";
const CATALOG_ADD_KEY = "monkey_extra_catalog_v1";

let catalog = [];
let currentItem = null;

init().catch(err => {
  console.error(err);
  STATUS.textContent = "Error inicializando la app.";
});

async function init() {
  await registerSW();
  await loadCatalog();
  loadExtraCatalog();
  await refreshCacheCount();

  BTN_NEXT.addEventListener("click", () => showRandom());
  BTN_FAV.addEventListener("click", () => toggleFav());
  BTN_CLEAR.addEventListener("click", () => clearImageCache());
  ONLY_CC0.addEventListener("change", () => showRandom());

  ANIMAL_BTNS.forEach(btn => {
    btn.addEventListener("click", () => {
      currentAnimal = btn.dataset.animal;
      ANIMAL_BTNS.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      updateAnimalUI();
      showRandom();
    });
  });

  BTN_TOGGLE_DISCOVERY.addEventListener("click", () => switchView("discovery"));
  BTN_BACK.addEventListener("click", () => switchView("main"));
  BTN_SEARCH.addEventListener("click", () => handleDiscoverySearch());
  BTN_DISCOVER_CATEGORY.addEventListener("click", () => handleCategoryDiscovery());
  addRetroUiSounds();
  setupInteractionGate();
  SEARCH_QUERY.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleDiscoverySearch();
  });

  // Apply initial UI labels
  updateAnimalUI();

  // primera carga
  await showRandom();
}

function switchView(view) {
  VIEW_MAIN.hidden = (view === "discovery");
  VIEW_DISCOVERY.hidden = (view !== "discovery");
}

async function handleDiscoverySearch() {
  const query = SEARCH_QUERY.value.trim();
  if (!query) return;

  DISCOVERY_RESULTS.innerHTML = '<div class="empty-msg">Buscando en Wikimedia...</div>';

  try {
    const results = await searchWikimedia(query);
    renderDiscoveryResults(results);
  } catch (err) {
    console.error(err);
    DISCOVERY_RESULTS.innerHTML = '<div class="empty-msg">Error en la búsqueda. Revisa tu conexión.</div>';
  }
}

async function handleCategoryDiscovery() {
  const { category } = getAnimalMeta();
  DISCOVERY_RESULTS.innerHTML = `<div class="empty-msg">Explorando Categoría: ${category} en Wikimedia...</div>`;

  try {
    const results = await fetchCategoryMonkeys(category);
    renderDiscoveryResults(results);
  } catch (err) {
    console.error(err);
    DISCOVERY_RESULTS.innerHTML = '<div class="empty-msg">Error explorando la categoría. Revisa tu conexión.</div>';
  }
}

function renderDiscoveryResults(results) {
  DISCOVERY_RESULTS.innerHTML = "";
  if (results.length === 0) {
    DISCOVERY_RESULTS.innerHTML = '<div class="empty-msg">No se encontraron imágenes CC0/PD. Prueba con otra palabra.</div>';
    return;
  }

  results.forEach(item => {
    const div = document.createElement("div");
    div.className = "result-item";
    div.innerHTML = `
      <img src="${item.url}" class="result-thumb" loading="lazy">
      <div class="result-info">
        <div class="result-title">${item.title}</div>
        <div class="result-lic">${item.license}</div>
        <button class="btn small primary btn-add-tool" data-id="${item.id}">+ Al catálogo</button>
      </div>
    `;

    div.querySelector(".btn-add-tool").onclick = () => addToCatalog(item);
    DISCOVERY_RESULTS.appendChild(div);
  });
}

function addToCatalog(item) {
  // Evitar duplicados
  if (catalog.some(it => it.id === item.id)) {
    alert("Esta imagen ya está en tu catálogo.");
    return;
  }

  catalog.push(item);
  saveExtraItem(item);
  alert("¡Añadida! Ahora aparecerá cuando pidas 'Otro chango'.");
}

function saveExtraItem(item) {
  const extras = getExtraCatalog();
  extras.push(item);
  localStorage.setItem(CATALOG_ADD_KEY, JSON.stringify(extras));
}

function getExtraCatalog() {
  try {
    const raw = localStorage.getItem(CATALOG_ADD_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadExtraCatalog() {
  const extras = getExtraCatalog();
  catalog = [...catalog, ...extras];
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return;

  const reg = await navigator.serviceWorker.register("./service-worker.js", { scope: "./" });

  // Escucha mensajes del SW
  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg) return;

    if (msg.type === "IMAGE_CACHE_CLEARED") {
      STATUS.textContent = "Caché de imágenes borrada.";
      refreshCacheCount();
    }
    if (msg.type === "IMAGE_CACHE_COUNT") {
      CACHE_COUNT.textContent = `Cache: ${msg.count}`;
    }
  });

  // Forzar update suave
  reg.update().catch(() => { });
}

async function loadCatalog() {
  const res = await fetch("./monkeys.json", { cache: "no-store" });
  if (!res.ok) throw new Error("No se pudo cargar monkeys.json");
  const data = await res.json();
  catalog = Array.isArray(data.items) ? data.items : [];
  if (catalog.length === 0) {
    STATUS.textContent = "monkeys.json está vacío. Agrega URLs.";
  }
}

function pickRandom(list) {
  const n = list.length;
  if (!n) return null;
  const idx = Math.floor(Math.random() * n);
  return list[idx];
}

function getAnimalMeta() {
  if (currentAnimal === "cat") return {
    terms: ["cat", "kitten", "tabby cat", "domestic cat", "Felis catus", "persian cat", "siamese cat", "feline", "tomcat"],
    category: "Domestic_cats",
    title: "Gatos aleatorios",
    next: "Otro gato 🐱"
  };
  if (currentAnimal === "dog") return {
    terms: ["dog", "puppy", "domestic dog", "Canis lupus familiaris", "golden retriever", "labrador", "beagle", "poodle", "dachshund"],
    category: "Dogs",
    title: "Perros aleatorios",
    next: "Otro perro 🐶"
  };
  if (currentAnimal === "all") return {
    terms: ["monkey", "ape", "chimpanzee", "cat", "kitten", "dog", "puppy", "gorilla", "tabby", "macaque"],
    category: "Animals",
    title: "Animales aleatorios",
    next: "Otro animal"
  };
  // default: monkey
  return {
    terms: ["monkey", "ape", "primate", "chimpanzee", "gorilla", "orangutan", "macaque", "baboon", "gibbon", "tamarin", "marmoset", "capuchin", "lemur"],
    category: "Monkeys",
    title: "Changos aleatorios",
    next: "Otro chango 🐒"
  };
}

function updateAnimalUI() {
  const { title, next, category } = getAnimalMeta();
  APP_TITLE.textContent = title;
  BTN_NEXT.textContent = next;
  BTN_DISCOVER_CATEGORY.textContent = `Descubrir: ${category}`;
}

function filteredCatalog() {
  // Filter by animal type using title/tags keywords
  const { terms } = getAnimalMeta();
  let items = currentAnimal === "all"
    ? catalog
    : catalog.filter(it => {
        const text = `${it.title || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
        return terms.some(k => text.includes(k.toLowerCase()));
      });

  if (!ONLY_CC0.checked) return items;

  // Strict CC0 / PD — only exact matches, no fallback
  return items.filter(it => {
    const lic = (it.license || "").toLowerCase();
    return lic.includes("cc0") || lic.includes("public domain") || lic === "pd";
  });
}

/** Fetch a random animal image live from Wikimedia API. */
async function fetchRandomFromWikimedia() {
  const { terms } = getAnimalMeta();
  const term = terms[Math.floor(Math.random() * terms.length)];
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `filetype:bitmap ${term}`,
    gsrnamespace: "6",
    gsrlimit: "20",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    origin: "*"
  });

  const resp = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  const data = await resp.json();
  if (!data.query || !data.query.pages) return null;

  const pages = Object.values(data.query.pages);
  const withThumb = pages.filter(p => p.imageinfo && p.imageinfo[0].thumburl);
  if (!withThumb.length) return null;

  // Strict CC0/PD filter — when enabled, return null if no compliant images found
  const usePdOnly = ONLY_CC0.checked;
  let pool;
  if (usePdOnly) {
    pool = withThumb.filter(p => {
      const lic = (p.imageinfo[0].extmetadata?.LicenseShortName?.value || "").toLowerCase();
      return lic.includes("cc0") || lic.includes("public domain") || lic === "pd";
    });
    if (!pool.length) return null; // strictly enforce: no compliant images, skip
  } else {
    pool = withThumb;
  }

  const page = pool[Math.floor(Math.random() * pool.length)];
  const info = page.imageinfo[0];
  const meta = info.extmetadata || {};
  return {
    id: `wm-live-${page.pageid}`,
    title: meta.ObjectName?.value || page.title.replace("File:", ""),
    url: info.thumburl,    // ← stable upload.wikimedia.org thumbnail, CORS-safe
    source: "Wikimedia Commons",
    author: (meta.Artist?.value || "Unknown").replace(/<[^>]*>/g, ""),
    license: meta.LicenseShortName?.value || "—",
    attribution: meta.License?.value || meta.LicenseShortName?.value || "—"
  };
}

async function showRandom() {
  STATUS.textContent = "Cargando imagen…";
  setLoading(true);

  try {
    // 1. Try live Wikimedia API first (always fresh, always correct CORS)
    const liveItem = await fetchRandomFromWikimedia();
    if (liveItem) {
      currentItem = liveItem;
      renderItem(liveItem, liveItem.url);
      playRetroSound("success");
      STATUS.textContent = "Listo.";
      await refreshCacheCount();
      return;
    }

    // 2. Fallback: static catalog (for saved favorites/custom items)
    const list = filteredCatalog();
    const item = pickRandom(list);
    if (!item) {
      STATUS.textContent = "Sin imágenes disponibles.";
      setLoading(false);
      return;
    }
    currentItem = item;
    renderItem(item, item.url);
    playRetroSound("success");
    STATUS.textContent = "Listo (catálogo local).";
    await refreshCacheCount();
  } catch (e) {
    console.warn("Error cargando imagen", e);
    playRetroSound("error");
    STATUS.textContent = "Error de conexión. Intenta de nuevo.";
    setLoading(false);
  }
}

function renderItem(item, resolvedUrl = "") {
  const displayUrl = resolvedUrl || sanitizeUrl(item.url);
  IMG_EL.alt = item.title || "Chango aleatorio";
  TITLE.textContent = item.title || "Sin título";
  SOURCE.textContent = `${item.source || "Fuente desconocida"} • ${item.author || "Autor desconocido"}`;

  const safeUrl = displayUrl;
  IMG_OPEN_LINK.href = safeUrl || "#";
  BTN_OPEN_IMAGE.href = safeUrl || "#";

  LICENSE.innerHTML = buildLicenseHtml(item, safeUrl);
  updateFavButton();

  // Bind loading state to the actual <img> element's events
  setLoading(true);
  IMG_EL.onload = () => setLoading(false);
  IMG_EL.onerror = () => setLoading(false);
  IMG_EL.src = displayUrl;
}

function setLoading(isLoading) {
  LOADING.hidden = !isLoading;
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

async function findWorkingImageUrl(item) {
  const candidates = buildUrlCandidates(item);
  for (const candidate of candidates) {
    const ok = await preloadImage(candidate);
    if (ok) return candidate;
  }
  return "";
}

function getSafeMonkeyUrl(fileName, width = 600) {
  if (!fileName) return "";
  // Limpia el nombre por si trae "File:"
  const cleanName = fileName.replace(/^File:/, "").replace(/ /g, "_");
  return `https://commons.wikimedia.org/w/thumb.php?f=${encodeURIComponent(cleanName)}&w=${width}`;
}

function buildUrlCandidates(item) {
  const candidates = [];

  const original = sanitizeUrl(item?.url);
  const thumb = sanitizeUrl(item?.thumb);
  const title = item?.title || "";

  // 1. Prioritize the explicitly provided 'original' and 'thumb' from monkeys.json
  // since they are now standardized canonical thumb.php URLs.
  if (original) candidates.push(original);
  if (thumb && thumb !== original) candidates.push(thumb);

  // 2. Add candidates from 'links' array
  if (Array.isArray(item.links)) {
    for (const link of item.links) {
      const safe = sanitizeUrl(link);
      if (safe) candidates.push(safe);
    }
  }

  // 3. Heuristic fallbacks: Try to build a clean thumb.php URL if name is found elsewhere
  const fileNameFromTitle = title.startsWith("File:") ? title.replace(/^File:/, "") : "";
  if (fileNameFromTitle) {
    candidates.push(getSafeMonkeyUrl(fileNameFromTitle, 600));
  }

  const fileNameFromUrl = extractFileName(original || thumb);
  if (fileNameFromUrl && !original.includes(fileNameFromUrl)) {
    // Only if it's potentially different from what we already have
    candidates.push(getSafeMonkeyUrl(fileNameFromUrl, 600));
  }

  return [...new Set(candidates)];
}

function extractFileName(imageUrl) {
  if (!imageUrl) return "";
  try {
    const url = new URL(imageUrl);
    const fileParam = url.searchParams.get("f");
    if (fileParam) {
      return decodeURIComponent(fileParam).replace(/^File:/, "").trim();
    }

    if (url.pathname.includes("/Special:FilePath/")) {
      const specialPathPart = url.pathname.split("/Special:FilePath/").pop();
      if (!specialPathPart) return "";
      return decodeURIComponent(specialPathPart).replace(/^File:/, "").trim();
    }

    let pathPart = url.pathname.split("/").pop();
    if (!pathPart) return "";

    // If it's a thumbnail path like /thumb/.../File.jpg/480px-File.jpg
    // the actual filename is the second to last part.
    if (url.pathname.includes("/thumb/") && pathPart.match(/^\d+px-/)) {
      const parts = url.pathname.split("/");
      pathPart = parts[parts.length - 2];
    }

    const decoded = decodeURIComponent(pathPart).trim();
    if (!decoded) return "";
    return decoded.replace(/^\d+\s+/, "").replace(/^File:/, "");
  } catch {
    return "";
  }
}


function sanitizeUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
    return "";
  } catch {
    return "";
  }
}

function buildLicenseHtml(item, safeUrl) {
  const license = item.license || "No especificada";
  const attribution = item.attribution || "—";
  const id = item.id ? `ID: ${item.id}` : "";
  const link = safeUrl
    ? `Imagen original: <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">abrir enlace</a>`
    : "Imagen original: enlace no disponible";
  return [
    `Licencia: ${license}`,
    `Atribución sugerida: ${attribution}`,
    link,
    id
  ].filter(Boolean).join("<br>");
}

let audioCtx;
let userInteracted = false;


function setupInteractionGate() {
  const markInteraction = () => {
    userInteracted = true;
    window.removeEventListener("pointerdown", markInteraction);
    window.removeEventListener("keydown", markInteraction);
  };

  window.addEventListener("pointerdown", markInteraction, { once: true });
  window.addEventListener("keydown", markInteraction, { once: true });
}

function addRetroUiSounds() {
  document.querySelectorAll(".btn, .link-btn").forEach((element) => {
    element.addEventListener("click", () => playRetroSound("click"));
  });
}

function playRetroSound(type = "click") {
  if (!userInteracted) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  const now = audioCtx.currentTime;

  if (type === "click") {
    playTone(now, 880, 0.03, "square", 0.04);
    playTone(now + 0.03, 660, 0.05, "square", 0.03);
    return;
  }

  if (type === "success") {
    playTone(now, 523.25, 0.06, "triangle", 0.05);
    playTone(now + 0.06, 659.25, 0.06, "triangle", 0.05);
    playTone(now + 0.12, 783.99, 0.08, "triangle", 0.06);
    return;
  }

  playTone(now, 220, 0.09, "sawtooth", 0.06);
  playTone(now + 0.08, 155, 0.12, "sawtooth", 0.05);
}

function playTone(start, frequency, duration, wave, volume) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = wave;
  osc.frequency.value = frequency;

  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(start);
  osc.stop(start + duration);
}

function getFavs() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function setFavs(arr) {
  localStorage.setItem(FAV_KEY, JSON.stringify(arr));
}

function isFav(item) {
  if (!item) return false;
  const favs = getFavs();
  return favs.includes(item.id);
}

function toggleFav() {
  if (!currentItem || !currentItem.id) {
    STATUS.textContent = "Esta entrada no tiene id; agrega id en monkeys.json para favoritos.";
    return;
  }
  const favs = getFavs();
  const idx = favs.indexOf(currentItem.id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(currentItem.id);
  setFavs(favs);
  updateFavButton();
}

function updateFavButton() {
  const fav = isFav(currentItem);
  BTN_FAV.textContent = fav ? "★ En favoritos" : "☆ Favorito";
}

async function clearImageCache() {
  if (!navigator.serviceWorker?.controller) {
    STATUS.textContent = "SW no activo aún. Recarga la página e intenta de nuevo.";
    return;
  }
  navigator.serviceWorker.controller.postMessage({ type: "CLEAR_IMAGE_CACHE" });
  STATUS.textContent = "Borrando caché…";
}

async function refreshCacheCount() {
  if (!navigator.serviceWorker?.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: "COUNT_IMAGE_CACHE" });
}
