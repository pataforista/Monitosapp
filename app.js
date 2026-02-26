import { searchWikimedia } from "./discovery-service.js";

const VIEW_MAIN = document.getElementById("viewMain");
const VIEW_DISCOVERY = document.getElementById("viewDiscovery");
const BTN_TOGGLE_DISCOVERY = document.getElementById("btnToggleDiscovery");
const BTN_SEARCH = document.getElementById("btnSearch");
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

  BTN_TOGGLE_DISCOVERY.addEventListener("click", () => switchView("discovery"));
  BTN_BACK.addEventListener("click", () => switchView("main"));
  BTN_SEARCH.addEventListener("click", () => handleDiscoverySearch());
  addRetroUiSounds();
  setupInteractionGate();
  SEARCH_QUERY.addEventListener("keypress", (e) => {
    if (e.key === "Enter") handleDiscoverySearch();
  });

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

function filteredCatalog() {
  if (!ONLY_CC0.checked) return catalog;

  // Solo CC0 / PD
  return catalog.filter(it => {
    const lic = (it.license || "").toLowerCase();
    return lic.includes("cc0") || lic.includes("public domain") || lic === "pd";
  });
}

async function showRandom() {
  const list = filteredCatalog();
  const item = pickRandom(list);

  if (!item) {
    STATUS.textContent = "No hay imágenes que cumplan el filtro. Revisa licencias en monkeys.json.";
    return;
  }

  currentItem = item;
  setLoading(true);
  STATUS.textContent = "Cargando imagen…";

  // Pre-carga para evitar parpadeo
  try {
    const resolvedUrl = await findWorkingImageUrl(item);
    if (!resolvedUrl) throw new Error("Fallo al cargar imagen");
    renderItem(item, resolvedUrl);
    playRetroSound("success");
    STATUS.textContent = "Listo.";
    await refreshCacheCount();
  } catch (e) {
    console.warn(e);
    playRetroSound("error");
    STATUS.textContent = "No se pudo cargar esa imagen. Probando otra…";
    // Intento rápido con otra
    await safeRetry(4);
  } finally {
    setLoading(false);
  }
}

async function safeRetry(maxTries = 4) {
  for (let i = 0; i < maxTries; i++) {
    const item = pickRandom(filteredCatalog());
    if (!item) return;
    try {
      const resolvedUrl = await findWorkingImageUrl(item);
      if (!resolvedUrl) continue;
      currentItem = item;
      renderItem(item, resolvedUrl);
      playRetroSound("success");
      STATUS.textContent = "Listo.";
      await refreshCacheCount();
      return;
    } catch { }
  }
  STATUS.textContent = "Varias URLs fallaron. Revisa CORS/URLs en monkeys.json.";
}

function renderItem(item, resolvedUrl = "") {
  const displayUrl = resolvedUrl || sanitizeUrl(item.url);
  IMG_EL.crossOrigin = "anonymous";
  IMG_EL.src = displayUrl;
  IMG_EL.alt = item.title || "Chango aleatorio";
  TITLE.textContent = item.title || "Sin título";
  SOURCE.textContent = `${item.source || "Fuente desconocida"} • ${item.author || "Autor desconocido"}`;

  const safeUrl = displayUrl;
  IMG_OPEN_LINK.href = safeUrl || "#";
  BTN_OPEN_IMAGE.href = safeUrl || "#";

  LICENSE.innerHTML = buildLicenseHtml(item, safeUrl);

  updateFavButton();
}

function setLoading(isLoading) {
  LOADING.hidden = !isLoading;
}

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

function buildUrlCandidates(item) {
  const candidates = [];
  const original = sanitizeUrl(item?.url);
  const thumb = sanitizeUrl(item?.thumb);
  const title = item?.title || "";

  if (original) candidates.push(original);
  if (thumb && thumb !== original) candidates.push(thumb);

  const fileNameFromUrl = extractFileName(original || thumb);
  if (fileNameFromUrl) {
    candidates.push(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileNameFromUrl)}`);
  }

  const fileNameFromTitle = title.startsWith("File:") ? title.replace(/^File:/, "") : "";
  if (fileNameFromTitle) {
    candidates.push(`https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileNameFromTitle)}`);
  }

  return [...new Set(candidates)];
}

function extractFileName(imageUrl) {
  if (!imageUrl) return "";
  try {
    const url = new URL(imageUrl);
    const pathPart = url.pathname.split("/").pop();
    if (!pathPart) return "";
    const decoded = decodeURIComponent(pathPart).trim();
    if (!decoded) return "";
    return decoded.replace(/^\d+\s+/, "");
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
