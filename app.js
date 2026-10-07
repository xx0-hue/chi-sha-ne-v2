const restaurants = window.NEARBY_FOOD_RESTAURANTS;

const workspace = document.querySelector("#workspace");
const mapPanel = document.querySelector("#mapPanel");
const listPanel = document.querySelector("#listPanel");
const restaurantList = document.querySelector("#restaurantList");
const mapMarkers = document.querySelector("#mapMarkers");
const resultCount = document.querySelector("#resultCount");
const searchInput = document.querySelector("#searchInput");
const clearSearch = document.querySelector("#clearSearch");
const emptyState = document.querySelector("#emptyState");
const userButton = document.querySelector("#userButton");
const userMenu = document.querySelector("#userMenu");
const decisionButton = document.querySelector("#decisionButton");
const assistantButton = document.querySelector("#assistantButton");
const assistantSheet = document.querySelector("#assistantSheet");
const closeAssistant = document.querySelector("#closeAssistant");
const locateButton = document.querySelector("#locateButton");
const mapCanvas = document.querySelector("#mapCanvas");
const mapStatus = document.querySelector("#mapStatus");
const mapStatusText = document.querySelector("#mapStatusText");
const mapRetryButton = document.querySelector("#mapRetryButton");
const mapBadge = document.querySelector("#mapBadge");
const filterButton = document.querySelector("#filterButton");
const toast = document.querySelector("#toast");
const decisionFlow = document.querySelector("#decisionFlow");
const closeDecisionFlow = document.querySelector("#closeDecisionFlow");
const flowStage = document.querySelector("#flowStage");
const flowFooter = document.querySelector("#flowFooter");
const flowBack = document.querySelector("#flowBack");
const flowEarly = document.querySelector("#flowEarly");
const flowNext = document.querySelector("#flowNext");
const flowProgressBar = document.querySelector("#flowProgressBar");
const flowStepLabel = document.querySelector("#flowStepLabel");
const assistantHome = document.querySelector("#assistantHome");
const assistantDynamic = document.querySelector("#assistantDynamic");
const onboardingOverlay = document.querySelector("#onboardingOverlay");
const onboardingSpotlight = document.querySelector("#onboardingSpotlight");
const onboardingTip = document.querySelector("#onboardingTip");
const onboardingCount = document.querySelector("#onboardingCount");
const onboardingTitle = document.querySelector("#onboardingTitle");
const onboardingText = document.querySelector("#onboardingText");
const skipOnboarding = document.querySelector("#skipOnboarding");
const nextOnboarding = document.querySelector("#nextOnboarding");
const appShell = document.querySelector(".app-shell");

let visibleRestaurants = [...restaurants];
let selectedId = restaurants[0]?.id;
let toastTimer;
let flowStep = 0;
let flowDirection = "forward";
let flowAdvanceTimer;
let rankedChoices = [];
let rankedChoiceIndex = 0;
let holdDelay;
let holdInterval;
let quickCandidates = [];
let quickIndex = -1;
let quickTimer;
let onboardingStep = 0;
let realMapInitialized = false;
let userLocation = null;
let sortMode = "distance";
let favoriteIds = new Set();
const runtimeRestaurantLocations = new Map();
const displayRestaurantDistances = new Map();

const favoriteStorageKey = "nearby-food-v2-favorites";
const historyStorageKey = "nearby-food-v2-history";

function readStoredIds(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? new Set(value) : new Set();
  } catch (error) {
    return new Set();
  }
}

function writeStoredIds(key, ids) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch (error) {
    // 收藏和历史不影响主流程，存储不可用时继续使用当前会话状态。
  }
}

favoriteIds = readStoredIds(favoriteStorageKey);

const decisionState = {
  party: null,
  customPeople: 3,
  scene: null,
  budgetMin: 50,
  budgetMax: 400,
  exploration: null,
  requirements: new Set(),
  sceneAnswers: new Set(),
  scenePriority: null,
  dietaryNote: "",
  distance: "unlimited",
  customDistance: 2
};

const partyOptions = [
  ["solo", "1人", "给自己认真选一顿"], ["couple", "2人", "两个人刚刚好"],
  ["family", "家庭", "照顾一家人的口味"], ["group", "多人聚餐", "热热闹闹吃一顿"],
  ["custom", "自定义人数", "告诉饭饭具体人数"]
];

const sceneOptions = [
  ["date", "约会"], ["daily", "普通吃饭"], ["family", "家庭聚餐"],
  ["friends", "朋友聚会"], ["business", "商务请客"], ["travel", "旅游探索"]
];

const requirementOptions = [
  ["dietary", "忌口"], ["parking", "停车"], ["elder", "老人"], ["children", "孩子"],
  ["pregnant", "孕妇"], ["quiet", "安静"], ["privateRoom", "包间"]
];

const distanceOptions = [
  ["500", "500米"], ["1000", "1公里"], ["3000", "3公里"],
  ["5000", "5公里"], ["unlimited", "不限"], ["custom", "自定义"]
];

function setFocus(mode) {
  workspace.dataset.focus = mode;
  scheduleMapResize(380);
}

function scheduleMapResize(delay = 0) {
  requestAnimationFrame(() => requestAnimationFrame(() => window.NearbyFoodMap?.resize()));
  if (delay) setTimeout(() => window.NearbyFoodMap?.resize(), delay);
}

function restaurantDistanceMeters(restaurant) {
  return displayRestaurantDistances.get(restaurant.id)?.meters ?? restaurant.distance;
}

function restaurantDistanceLabel(restaurant) {
  return displayRestaurantDistances.get(restaurant.id)?.text || formatDistance(restaurant.distance);
}

function sortedRestaurants(items = visibleRestaurants) {
  return [...items].sort((a, b) => {
    if (sortMode === "price") return a.price - b.price || restaurantDistanceMeters(a) - restaurantDistanceMeters(b);
    return restaurantDistanceMeters(a) - restaurantDistanceMeters(b) || a.price - b.price;
  });
}

function updateFavoriteCount() {
  const favoriteCount = document.querySelector("#favoriteCount");
  if (favoriteCount) favoriteCount.textContent = `${favoriteIds.size} 家`;
}

function updateHistoryCount() {
  const historyCount = document.querySelector("#historyCount");
  if (historyCount) historyCount.textContent = `${readStoredIds(historyStorageKey).size} 家`;
}

function toggleFavorite(id) {
  if (favoriteIds.has(id)) {
    favoriteIds.delete(id);
    showToast("已取消收藏");
  } else {
    favoriteIds.add(id);
    showToast("已收藏，之后可以在用户菜单里找到");
  }
  writeStoredIds(favoriteStorageKey, favoriteIds);
  updateFavoriteCount();
  render();
}

function rememberDecision(id) {
  const historyIds = readStoredIds(historyStorageKey);
  historyIds.delete(id);
  historyIds.add(id);
  writeStoredIds(historyStorageKey, historyIds);
  updateHistoryCount();
}

function restaurantCard(restaurant) {
  return `
    <article class="restaurant-card${restaurant.id === selectedId ? " selected" : ""}" data-id="${restaurant.id}" tabindex="0">
      <img class="restaurant-image" src="${restaurant.image}" alt="${restaurant.name}餐厅示意图" loading="lazy">
      <div>
        <div class="card-title-row"><h3>${restaurant.name}</h3><button class="favorite-button${favoriteIds.has(restaurant.id) ? " active" : ""}" type="button" data-favorite-id="${restaurant.id}" aria-label="${favoriteIds.has(restaurant.id) ? "取消收藏" : "收藏"}${restaurant.name}" aria-pressed="${favoriteIds.has(restaurant.id)}">${favoriteIds.has(restaurant.id) ? "★" : "☆"}</button></div>
        <div class="primary-meta">
          <span>${restaurant.cuisine}</span><span>人均 ¥${restaurant.price}</span><span data-restaurant-distance="${restaurant.id}">${restaurantDistanceLabel(restaurant)}</span>
        </div>
        <p class="detail-line"><b>招牌</b>　${restaurant.signature}</p>
        <p class="detail-line"><b>适合</b>　${restaurant.scene}</p>
        <div class="recommendation-reasons">
          <b>为什么推荐它</b>
          <ul>${restaurant.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul>
        </div>
      </div>
    </article>`;
}

function marker(restaurant) {
  return `<button class="map-marker${restaurant.id === selectedId ? " active" : ""}" data-id="${restaurant.id}" style="left:${restaurant.marker.x}%;top:${restaurant.marker.y}%" aria-label="${restaurant.name}"><span></span></button>`;
}

function mapPreview(restaurant) {
  if (!restaurant) return "";
  return `<div class="map-preview" role="dialog" aria-label="${restaurant.name}地图信息">
    <button class="map-preview-close" type="button" aria-label="关闭">×</button>
    <div><h3>${restaurant.name}</h3><p>${restaurantDistanceLabel(restaurant)} · ${restaurant.cuisine}</p></div>
    <button class="map-preview-detail" type="button" data-id="${restaurant.id}">查看详情</button>
  </div>`;
}

function formatDistance(meters) {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

function displayDistanceText(restaurant) {
  return restaurantDistanceLabel(restaurant);
}

function render() {
  resultCount.textContent = visibleRestaurants.length;
  restaurantList.innerHTML = sortedRestaurants().map(restaurantCard).join("");
  mapMarkers.innerHTML = "";
  emptyState.hidden = visibleRestaurants.length > 0;
  updateFavoriteCount();
}

function selectRestaurant(id, source) {
  selectedId = id;
  render();
  if (source === "map") {
    const restaurant = visibleRestaurants.find(item => item.id === id);
    mapMarkers.insertAdjacentHTML("beforeend", mapPreview(restaurant));
    setFocus("map");
  } else {
    setFocus("list");
  }
}

function selectRestaurantWithoutRender(id, source) {
  selectedId = id;
  document.querySelectorAll(".restaurant-card").forEach(card => card.classList.toggle("selected", card.dataset.id === id));
  if (source === "list") window.NearbyFoodMap?.focusRestaurant(id, { center: true, openInfo: true });
  if (source === "map") {
    const card = document.querySelector(`.restaurant-card[data-id="${id}"]`);
    card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function syncRecommendationSelection(result) {
  if (!result) return;
  selectedId = result.restaurant.id;
  document.querySelectorAll(".restaurant-card").forEach(card => card.classList.toggle("selected", card.dataset.id === selectedId));
  window.NearbyFoodMap?.focusRestaurant(selectedId, { center: true, openInfo: false });
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

mapPanel.addEventListener("click", event => {
  if (event.target.closest(".amap-restaurant-marker, .amap-restaurant-info")) return;
  const close = event.target.closest(".map-preview-close");
  if (close) {
    event.stopPropagation();
    document.querySelector(".map-preview")?.remove();
    return;
  }
  const detail = event.target.closest(".map-preview-detail");
  if (detail) {
    event.stopPropagation();
    selectRestaurant(detail.dataset.id, "list");
    document.querySelector(`.restaurant-card[data-id="${detail.dataset.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const target = event.target.closest(".map-marker");
  if (target) selectRestaurant(target.dataset.id, "map");
  else setFocus("map");
});

mapPanel.addEventListener("focus", () => setFocus("map"));

listPanel.addEventListener("click", event => {
  const favorite = event.target.closest("[data-favorite-id]");
  if (favorite) {
    event.stopPropagation();
    toggleFavorite(favorite.dataset.favoriteId);
    return;
  }
  const card = event.target.closest(".restaurant-card");
  if (card) selectRestaurantWithoutRender(card.dataset.id, "list");
  else setFocus("list");
});

listPanel.addEventListener("focus", () => setFocus("list"));

restaurantList.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") {
    const card = event.target.closest(".restaurant-card");
    if (card) selectRestaurantWithoutRender(card.dataset.id, "list");
  }
});

searchInput.addEventListener("input", () => {
  const query = searchInput.value.trim().toLowerCase();
  clearSearch.hidden = !query;
  visibleRestaurants = restaurants.filter(restaurant =>
    [restaurant.name, restaurant.cuisine, restaurant.signature, restaurant.scene]
      .some(value => value.toLowerCase().includes(query))
  );
  if (!visibleRestaurants.some(item => item.id === selectedId)) selectedId = visibleRestaurants[0]?.id;
  render();
});

clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  searchInput.dispatchEvent(new Event("input"));
  searchInput.focus();
});

userButton.addEventListener("click", event => {
  event.stopPropagation();
  userMenu.hidden = !userMenu.hidden;
  userButton.setAttribute("aria-expanded", String(!userMenu.hidden));
});

document.addEventListener("click", event => {
  if (!event.target.closest(".user-area")) {
    userMenu.hidden = true;
    userButton.setAttribute("aria-expanded", "false");
  }
});

userMenu.addEventListener("click", event => {
  const item = event.target.closest("button");
  if (!item) return;
  if (item.dataset.userAction === "favorites") {
    if (!favoriteIds.size) showToast("还没有收藏，点餐厅卡片右上角的星星即可收藏");
    else showToast(`已收藏 ${favoriteIds.size} 家餐厅`);
    return;
  }
  if (item.dataset.userAction === "history") {
    const count = readStoredIds(historyStorageKey).size;
    showToast(count ? `最近决定过 ${count} 家餐厅` : "还没有决定记录，先让饭饭帮你选一家吧");
    return;
  }
  showToast(`${item.querySelector("span").textContent}功能将在后续版本开放`);
});

decisionButton.addEventListener("click", () => {
  openDecisionFlow();
});

assistantButton.addEventListener("click", () => {
  showAssistantHome();
  assistantSheet.hidden = false;
  appShell.classList.add("assistant-open");
  assistantButton.setAttribute("aria-expanded", "true");
  scheduleMapResize(300);
});
closeAssistant.addEventListener("click", () => {
  clearTimeout(quickTimer);
  assistantSheet.hidden = true;
  appShell.classList.remove("assistant-open");
  assistantButton.setAttribute("aria-expanded", "false");
  scheduleMapResize(300);
});
assistantSheet.addEventListener("click", event => {
  const action = event.target.closest("button[data-action], button[data-quick-action]");
  if (!action) return;
  if (action.dataset.action === "quick") {
    beginQuickChoice();
  } else if (action.dataset.action === "express") {
    assistantSheet.hidden = true;
    appShell.classList.remove("assistant-open");
    assistantButton.setAttribute("aria-expanded", "false");
    openNaturalFlow();
  } else if (action.dataset.action === "tutorial") {
    assistantSheet.hidden = true;
    appShell.classList.remove("assistant-open");
    assistantButton.setAttribute("aria-expanded", "false");
    scheduleMapResize(300);
    startOnboarding();
  } else if (action.dataset.quickAction === "next") {
    showQuickLoading("换一家口味，看看有没有更合适的～", showNextQuickChoice);
  } else if (action.dataset.quickAction === "accept") {
    acceptQuickChoice();
  } else if (action.dataset.quickAction === "back") {
    showAssistantHome();
  }
});
locateButton.addEventListener("click", event => {
  event.stopPropagation();
  realMapInitialized ? requestCurrentLocation() : initRealMap({ requestLocation: true });
});
mapRetryButton.addEventListener("click", () => realMapInitialized ? requestCurrentLocation() : initRealMap({ requestLocation: true }));
workspace.addEventListener("transitionend", event => {
  if (event.propertyName === "grid-template-rows") scheduleMapResize();
});
window.addEventListener("resize", () => scheduleMapResize(120));
filterButton.addEventListener("click", () => {
  sortMode = sortMode === "distance" ? "price" : "distance";
  filterButton.textContent = sortMode === "distance" ? "距离优先" : "人均优先";
  filterButton.setAttribute("aria-label", `当前${filterButton.textContent}，点击切换`);
  render();
  showToast(sortMode === "distance" ? "已按距离由近到远排列" : "已按人均价格由低到高排列");
});

function setMapState(state, message) {
  mapStatus.className = `map-status ${state}`;
  mapStatusText.textContent = message;
  mapStatus.hidden = state === "ready";
  mapRetryButton.hidden = state !== "error";
  mapBadge.textContent = state === "ready" ? "已定位" : state === "idle" ? "未定位" : state === "error" ? "定位失败" : "定位中";
}

function mapErrorMessage(error) {
  if (error?.code === "CONFIG_MISSING") return "请先在 map-config.js 中配置高德地图 Key 和安全密钥";
  if (error?.code === "PERMISSION_DENIED") return "位置权限未开启，请在浏览器设置中允许定位";
  if (error?.code === "LOAD_FAILED") return "地图加载失败，请检查网络和高德 Key 配置";
  return error?.message || "暂时无法获取你的位置，请稍后重试";
}

async function initRealMap({ requestLocation = false } = {}) {
  setMapState("loading", "正在加载地图…");
  try {
    await window.NearbyFoodMap.init(mapCanvas, window.NEARBY_FOOD_MAP_CONFIG);
    realMapInitialized = true;
    if (requestLocation) await requestCurrentLocation();
    else setMapState("idle", "地图已准备好，点击右下角定位附近餐厅");
  } catch (error) {
    setMapState("error", mapErrorMessage(error));
  }
}

async function requestCurrentLocation() {
  setMapState("locating", "正在请求位置权限…");
  locateButton.disabled = true;
  try {
    userLocation = await window.NearbyFoodMap.locate();
    refreshRuntimeRestaurantMap();
    setMapState("ready", "已显示当前位置");
  } catch (error) {
    setMapState("error", mapErrorMessage(error));
  } finally {
    locateButton.disabled = false;
  }
}

function translateMockLocation(location) {
  const origin = window.NEARBY_FOOD_MOCK_ORIGIN;
  if (!origin || !userLocation || !location) return null;
  const metersPerLatitudeDegree = 110540;
  const sourceLongitudeScale = 111320 * Math.cos(origin.lat * Math.PI / 180);
  const targetLongitudeScale = 111320 * Math.cos(userLocation.lat * Math.PI / 180);
  const eastMeters = (location.lng - origin.lng) * sourceLongitudeScale;
  const northMeters = (location.lat - origin.lat) * metersPerLatitudeDegree;
  return {
    lng: userLocation.lng + eastMeters / targetLongitudeScale,
    lat: userLocation.lat + northMeters / metersPerLatitudeDegree
  };
}

function calculateDistanceMeters(from, to) {
  const earthRadius = 6371000;
  const radians = value => value * Math.PI / 180;
  const latitudeDelta = radians(to.lat - from.lat);
  const longitudeDelta = radians(to.lng - from.lng);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function refreshRuntimeRestaurantMap() {
  if (!userLocation) {
    window.NearbyFoodMap?.clearRestaurantMarkers();
    return;
  }
  runtimeRestaurantLocations.clear();
  displayRestaurantDistances.clear();
  const mappedRestaurants = restaurants.map(restaurant => {
    const location = translateMockLocation(restaurant.location);
    const rawDistance = calculateDistanceMeters(userLocation, location);
    const roundedDistance = rawDistance < 1000 ? Math.max(10, Math.round(rawDistance / 10) * 10) : Math.round(rawDistance);
    const distanceText = formatDistance(roundedDistance);
    runtimeRestaurantLocations.set(restaurant.id, location);
    displayRestaurantDistances.set(restaurant.id, { meters: rawDistance, text: distanceText });
    return { ...restaurant, location, displayDistanceText: distanceText };
  });

  document.querySelectorAll("[data-restaurant-distance]").forEach(element => {
    const distance = displayRestaurantDistances.get(element.dataset.restaurantDistance);
    if (distance) element.textContent = distance.text;
  });
  render();
  window.NearbyFoodMap.setRestaurantMarkers(mappedRestaurants, id => selectRestaurantWithoutRender(id, "map"));
  window.NearbyFoodMap.focusRestaurant(selectedId, { center: false, openInfo: false });
}

function showAssistantHome() {
  clearTimeout(quickTimer);
  assistantSheet.classList.remove("assistant-expanded");
  assistantHome.hidden = false;
  assistantDynamic.hidden = true;
  assistantDynamic.innerHTML = "";
  scheduleMapResize(300);
}

function beginQuickChoice() {
  const currentPool = visibleRestaurants.length ? visibleRestaurants : restaurants;
  quickCandidates = currentPool
    .filter(restaurant => restaurant.image && restaurant.cuisine && restaurant.price <= 200 && restaurantDistanceMeters(restaurant) <= 5000)
    .sort((a, b) => restaurantDistanceMeters(a) - restaurantDistanceMeters(b) || a.price - b.price);
  if (!quickCandidates.length) quickCandidates = [...restaurants].sort((a, b) => restaurantDistanceMeters(a) - restaurantDistanceMeters(b));
  quickIndex = -1;
  showQuickLoading("让我看看今天可以先试试哪一家～", showNextQuickChoice);
}

function showQuickLoading(message, callback) {
  clearTimeout(quickTimer);
  assistantSheet.classList.add("assistant-expanded");
  assistantHome.hidden = true;
  assistantDynamic.hidden = false;
  assistantDynamic.innerHTML = `<div class="quick-thinking"><span class="rice-ball thinking-rice" aria-hidden="true"><i></i></span><p>${message}</p><div><i></i><i></i><i></i></div></div>`;
  quickTimer = setTimeout(callback, 760);
  scheduleMapResize(300);
}

function showNextQuickChoice() {
  if (!quickCandidates.length) return;
  const previousId = quickCandidates[quickIndex]?.id;
  quickIndex = (quickIndex + 1) % quickCandidates.length;
  if (quickCandidates.length > 1 && quickCandidates[quickIndex].id === previousId) quickIndex = (quickIndex + 1) % quickCandidates.length;
  renderQuickChoice(quickCandidates[quickIndex]);
}

function quickChoiceReasons(restaurant) {
  const reasons = [];
  const distance = restaurantDistanceMeters(restaurant);
  if (distance <= 800) reasons.push("离你比较近，过去不会太折腾");
  else reasons.push(`距离约 ${formatDistance(distance)}，还在附近范围内`);
  if (restaurant.price <= 80) reasons.push("人均价格比较适合日常吃饭");
  else reasons.push("想认真吃一顿时可以先看看");
  if (restaurant.partyTypes.includes("solo")) reasons.push("一个人吃也比较方便");
  else if (restaurant.partyTypes.includes("group")) reasons.push("朋友一起聚餐也合适");
  else reasons.push(`${restaurant.cuisine}适合换换今天的口味`);
  return reasons.slice(0, 3);
}

function renderQuickChoice(restaurant) {
  const reasons = quickChoiceReasons(restaurant);
  assistantDynamic.innerHTML = `<section class="quick-choice-result">
    <p class="quick-choice-intro">饭饭帮你挑了一家，可以先看看～</p>
    <article><img src="${restaurant.image}" alt="${restaurant.name}餐厅示意图"><div class="quick-choice-title"><div><small>${restaurant.cuisine}</small><h3>${restaurant.name}</h3></div><span>${restaurantDistanceLabel(restaurant)}</span></div><p class="quick-choice-price">人均 ¥${restaurant.price}</p><div class="quick-choice-reasons"><b>为什么饭饭选它</b><ul>${reasons.map(reason => `<li>${reason}</li>`).join("")}</ul></div></article>
    <div class="quick-choice-actions"><button type="button" data-quick-action="accept">就吃它</button><button type="button" data-quick-action="next">换一个</button></div>
    <button class="quick-back" type="button" data-quick-action="back">返回饭饭助手</button>
  </section>`;
}

function acceptQuickChoice() {
  const restaurant = quickCandidates[quickIndex];
  if (!restaurant) return;
  selectedId = restaurant.id;
  rememberDecision(restaurant.id);
  if (!visibleRestaurants.some(item => item.id === restaurant.id)) {
    visibleRestaurants = [...restaurants];
    searchInput.value = "";
    clearSearch.hidden = true;
  }
  render();
  setFocus("list");
  assistantSheet.hidden = true;
  appShell.classList.remove("assistant-open");
  assistantButton.setAttribute("aria-expanded", "false");
  setTimeout(() => document.querySelector(`.restaurant-card[data-id="${selectedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  showToast(`饭饭先帮你选了「${restaurant.name}」，可以从这里看看`);
  scheduleMapResize(300);
}

const onboardingSteps = [
  { target: ".search-box", title: "第一步：搜索附近餐厅", text: "想吃火锅、烧烤或日料时，直接在这里搜一搜。" },
  { target: "#decisionButton", title: "第二步：不知道吃什么", text: "点击“帮我决定一家”，选几个简单条件，让饭饭帮你缩小范围。" },
  { target: "#assistantButton", title: "第三步：有特殊需求", text: "有自己的想法时，可以用一句话直接告诉饭饭。" },
  { target: ".list-header", title: "第四步：快速缩小选择", text: "饭饭会把值得先看的餐厅放到你面前，最后决定仍然交给你。" }
];

function startOnboarding() {
  onboardingStep = 0;
  onboardingOverlay.hidden = false;
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const step = onboardingSteps[onboardingStep];
  const target = document.querySelector(step.target);
  if (!target) { finishOnboarding(); return; }
  const shellRect = document.querySelector(".app-shell").getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const padding = 6;
  onboardingSpotlight.style.left = `${targetRect.left - shellRect.left - padding}px`;
  onboardingSpotlight.style.top = `${targetRect.top - shellRect.top - padding}px`;
  onboardingSpotlight.style.width = `${targetRect.width + padding * 2}px`;
  onboardingSpotlight.style.height = `${targetRect.height + padding * 2}px`;
  onboardingCount.textContent = `${onboardingStep + 1} / ${onboardingSteps.length}`;
  onboardingTitle.textContent = step.title;
  onboardingText.textContent = step.text;
  nextOnboarding.textContent = onboardingStep === onboardingSteps.length - 1 ? "知道了，继续看看" : "下一步";

  requestAnimationFrame(() => {
    const tipHeight = onboardingTip.offsetHeight;
    const below = targetRect.bottom - shellRect.top + 18;
    const above = targetRect.top - shellRect.top - tipHeight - 18;
    onboardingTip.style.top = `${below + tipHeight < shellRect.height ? below : Math.max(18, above)}px`;
  });
}

function finishOnboarding() {
  onboardingOverlay.hidden = true;
  scheduleMapResize(120);
}

nextOnboarding.addEventListener("click", () => {
  if (onboardingStep >= onboardingSteps.length - 1) finishOnboarding();
  else { onboardingStep += 1; renderOnboardingStep(); }
});
skipOnboarding.addEventListener("click", finishOnboarding);
window.addEventListener("resize", () => { if (!onboardingOverlay.hidden) renderOnboardingStep(); });

function openDecisionFlow() {
  assistantSheet.hidden = true;
  flowStep = 0;
  flowDirection = "forward";
  decisionFlow.hidden = false;
  appShell.classList.add("immersive-open");
  document.body.classList.add("flow-open");
  renderFlow();
  closeDecisionFlow.focus();
}

function closeFlow() {
  clearTimeout(flowAdvanceTimer);
  stopHoldAdjustment();
  decisionFlow.classList.add("leaving");
  setTimeout(() => {
    decisionFlow.hidden = true;
    decisionFlow.classList.remove("leaving");
    appShell.classList.remove("immersive-open");
    document.body.classList.remove("flow-open");
    decisionButton.focus();
    scheduleMapResize(120);
  }, 220);
}

function guideBlock(title, message) {
  return `<div class="flow-guide">
    <span class="rice-ball guide-rice" aria-hidden="true"><i></i></span>
    <div><small>饭饭</small><h2>${title}</h2><p>${message}</p></div>
  </div>`;
}

function optionButtons(options, selected, group) {
  return `<div class="conversation-options ${group}">${options.map(option => `
    <button class="conversation-option${selected === option[0] ? " selected" : ""}" type="button" data-choice="${group}" data-value="${option[0]}">
      <b>${option[1]}</b>${option[2] ? `<small>${option[2]}</small>` : ""}
    </button>`).join("")}</div>`;
}

function sceneFollowup() {
  const chips = options => `<div class="scene-answer-chips">${options.map(option => `
    <button type="button" data-scene-answer="${option[0]}" class="${decisionState.sceneAnswers.has(option[0]) ? "selected" : ""}">${option[1]}</button>`).join("")}</div>`;

  if (decisionState.scene === "family") {
    return `<section class="scene-followup"><p><b>饭饭多问一句</b>，同行人里有需要特别照顾的吗？</p>${chips([["elder", "有老人"], ["children", "有孩子"], ["pregnant", "有孕妇"]])}<small>没有的话，直接继续就好</small></section>`;
  }
  if (decisionState.scene === "date") {
    return `<section class="scene-followup"><p><b>想让这顿饭更舒服一点吗？</b></p>
      ${chips([["quiet", "希望安静聊天"]])}
      <p class="followup-subquestion">选餐厅时，你更看重：</p>
      <div class="scene-priority"><button type="button" data-scene-priority="environment" class="${decisionState.scenePriority === "environment" ? "selected" : ""}">环境氛围</button><button type="button" data-scene-priority="convenient" class="${decisionState.scenePriority === "convenient" ? "selected" : ""}">距离方便</button></div>
      <small>都不选也没关系，饭饭会综合考虑</small></section>`;
  }
  if (decisionState.scene === "business") {
    return `<section class="scene-followup"><p><b>请客时，有哪些条件比较重要？</b></p>${chips([["parking", "方便停车"], ["privateRoom", "需要包间"], ["quiet", "希望安静"]])}<small>按实际需要选，可以不选</small></section>`;
  }
  if (decisionState.scene === "friends") {
    return `<section class="scene-followup"><p><b>朋友聚餐，我再帮你留意两件事：</b></p>${chips([["groupSeating", "多人座位"], ["parking", "方便停车"]])}<small>没有特别要求就直接继续</small></section>`;
  }
  return "";
}

function renderFlow(animate = true) {
  const isResult = flowStep > 4;
  flowFooter.hidden = false;
  flowFooter.classList.toggle("result-footer", isResult);
  flowStepLabel.textContent = flowStep <= 4 ? `饭饭帮你选 · ${flowStep + 1}/5` : "饭饭帮你选 · 选好了";
  flowProgressBar.style.width = flowStep <= 4 ? `${(flowStep + 1) * 20}%` : "100%";
  flowBack.hidden = flowStep === 0;
  flowEarly.hidden = isResult || flowStep < 2;
  flowEarly.textContent = flowStep >= 2 && !isResult ? "先给我一家" : "现在就帮我选";
  const movesOnWithChoice = [0, 1, 3].includes(flowStep) && !(flowStep === 0 && decisionState.party === "custom");
  flowNext.hidden = isResult || movesOnWithChoice;
  flowNext.textContent = ["人数就这些", "就是这个场合", "预算差不多", "就按这个心情", "帮我选一家"][flowStep] || "就这样";

  let content = "";
  if (flowStep === 0) {
    content = `${guideBlock("今天几个人吃？", "我先知道这个，免得给你推荐不合适的店。")}
      ${optionButtons(partyOptions, decisionState.party, "party")}
      ${decisionState.party === "custom" ? `<label class="custom-field"><span>具体有几个人？</span><input id="customPeople" type="number" min="1" max="30" value="${decisionState.customPeople}" inputmode="numeric"><small>人</small></label>` : ""}`;
  } else if (flowStep === 1) {
    content = `${guideBlock("今天是什么局？", "随手点一个最接近的，我就知道该往哪个方向找了。")}
      ${optionButtons(sceneOptions, decisionState.scene, "scene")}`;
  } else if (flowStep === 2) {
    content = `${guideBlock("大概想花多少？", "不用算得太准，有个范围我就能避开不合适的。")}
      <section class="budget-conversation">
        <div class="budget-answer"><span>这顿预计</span><strong>¥${decisionState.budgetMin} <i>～</i> ¥${decisionState.budgetMax}</strong></div>
        <div class="dual-range" style="--low:${decisionState.budgetMin / 12}%;--high:${decisionState.budgetMax / 12}%">
          <div class="range-track"></div>
          <input type="range" min="0" max="1200" step="10" value="${decisionState.budgetMin}" data-range="min" aria-label="最低预算">
          <input type="range" min="0" max="1200" step="10" value="${decisionState.budgetMax}" data-range="max" aria-label="最高预算">
        </div>
        <div class="budget-adjustments">
          <div><span>最低预算</span><div class="stepper"><button type="button" data-adjust="min" data-delta="-1">−</button><b>¥${decisionState.budgetMin}</b><button type="button" data-adjust="min" data-delta="1">＋</button></div></div>
          <div><span>最高预算</span><div class="stepper"><button type="button" data-adjust="max" data-delta="-1">−</button><b>¥${decisionState.budgetMax}</b><button type="button" data-adjust="max" data-delta="1">＋</button></div></div>
        </div>
        <p class="hold-hint">按住 ＋ / − 可以连续调整</p>
      </section>`;
  } else if (flowStep === 3) {
    const explorationOptions = [
      ["1", "🙂 稳一点", "熟悉、安心，不容易踩雷"],
      ["2", "😋 尝点新的", "在熟悉范围里换点新花样"],
      ["3", "🚀 探索一下", "尝试以前没吃过的新味道"]
    ];
    content = `${guideBlock("今天想稳一点，还是尝点新的？", "没有标准答案，就看你现在的心情。")}
      ${optionButtons(explorationOptions, String(decisionState.exploration || ""), "exploration")}`;
  } else if (flowStep === 4) {
    content = `${guideBlock("有没有需要特别照顾的？", "有就告诉我；没有也没关系，我已经可以帮你选了。")}
      <div class="requirement-chips">${requirementOptions.map(option => `<button type="button" data-requirement="${option[0]}" class="${decisionState.requirements.has(option[0]) || decisionState.sceneAnswers.has(option[0]) ? "selected" : ""}">${option[1]}</button>`).join("")}</div>
      ${decisionState.requirements.has("dietary") ? `<label class="dietary-field"><span>有什么忌口？</span><input id="dietaryNote" value="${decisionState.dietaryNote}" placeholder="例如：不吃辣、花生过敏"></label>` : ""}
      <details class="more-conditions"${decisionState.distance !== "unlimited" ? " open" : ""}>
        <summary><span><b>更多条件</b><small>距离默认不限，可按需要调整</small></span></summary>
        <div class="distance-options">${distanceOptions.map(option => `<button type="button" data-distance="${option[0]}" class="${decisionState.distance === option[0] ? "selected" : ""}">${option[1]}</button>`).join("")}</div>
        ${decisionState.distance === "custom" ? `<label class="custom-field compact"><span>最远接受</span><input id="customDistance" type="number" min="0.1" max="50" step="0.1" value="${decisionState.customDistance}" inputmode="decimal"><small>公里</small></label>` : ""}
      </details>`;
  } else {
    content = renderDecisionResult();
  }

  flowStage.className = `flow-stage${animate ? ` enter-${flowDirection}` : ""}`;
  flowStage.innerHTML = content;
}

function isStepReady() {
  if (flowStep === 0 && !decisionState.party) return "先告诉饭饭今天有几个人吧";
  if (flowStep === 1 && !decisionState.scene) return "选一个最接近今天的情况吧";
  if (flowStep === 3 && !decisionState.exploration) return "今天想稳一点，还是探索一下？";
  return "";
}

function peopleCount() {
  if (decisionState.party === "solo") return 1;
  if (decisionState.party === "couple") return 2;
  if (decisionState.party === "family") return Math.max(1, Number(decisionState.customPeople) || 4);
  if (decisionState.party === "group") return Math.max(1, Number(decisionState.customPeople) || 6);
  return Math.max(1, Number(decisionState.customPeople) || 1);
}

function normalizedParty() {
  const count = peopleCount();
  if (count === 1) return "solo";
  if (count === 2) return "couple";
  return count <= 5 ? "family" : "group";
}

function distanceLimit() {
  if (decisionState.distance === "unlimited") return Infinity;
  if (decisionState.distance === "custom") return Number(decisionState.customDistance) * 1000;
  return Number(decisionState.distance);
}

function buildRankedChoices() {
  const count = peopleCount();
  const party = normalizedParty();
  const limit = distanceLimit();
  const requestedFeatures = [...new Set([
    ...decisionState.requirements,
    ...decisionState.sceneAnswers,
    ...(decisionState.scenePriority ? [decisionState.scenePriority] : [])
  ])].filter(item => item !== "dietary");

  const scored = restaurants.map(restaurant => {
    const total = restaurant.price * count;
    let score = 0;
    const reasonItems = [];
    const notes = [];
    const budgetFit = total >= decisionState.budgetMin && total <= decisionState.budgetMax;
    const distance = restaurantDistanceMeters(restaurant);
    const distanceFit = distance <= limit;

    if (budgetFit) { score += 35; reasonItems.push({ text: `总预算约 ¥${total}，在预算范围内`, priority: 70 }); }
    else if (total <= decisionState.budgetMax * 1.2) score += 12;
    if (distanceFit) { score += 25; reasonItems.push({ text: `距离约 ${formatDistance(distance)}`, priority: decisionState.distance === "unlimited" ? 45 : 80 }); }
    if (restaurant.partyTypes.includes(party)) {
      score += 12;
      const sceneFits = restaurant.scenes.includes(decisionState.scene);
      reasonItems.push({ text: sceneFits ? `适合今天${count}人${sceneLabel(decisionState.scene)}` : `适合今天${count}人用餐`, priority: 95 });
    }
    if (restaurant.scenes.includes(decisionState.scene)) { score += 18; reasonItems.push({ text: sceneRecommendationReason(restaurant), priority: 85 }); }
    if (restaurant.exploration === decisionState.exploration) { score += 10; reasonItems.push({ text: decisionState.exploration === 1 ? "口味稳妥，吃起来更安心" : "符合你今天想尝鲜的心情", priority: 55 }); }

    requestedFeatures.forEach(feature => {
      if (restaurant.features.includes(feature)) {
        score += 5;
        reasonItems.push({ text: `${featureLabel(feature)}这一点也照顾到了`, priority: 90 });
      } else notes.push(`${featureLabel(feature)}条件还需要到店前确认`);
    });
    if (decisionState.requirements.has("dietary")) notes.push("忌口信息需要到店前再次确认");
    if (!budgetFit) notes.push(`预计总价约 ¥${total}，不完全在预算范围内`);
    if (!distanceFit) notes.push("距离超出你设置的范围");

    const criteria = [
      { label: "预算", matched: budgetFit },
      ...(decisionState.party ? [{ label: "人数", matched: restaurant.partyTypes.includes(party) }] : []),
      ...(decisionState.scene ? [{ label: "场景", matched: restaurant.scenes.includes(decisionState.scene) }] : []),
      ...(decisionState.exploration ? [{ label: "尝试程度", matched: restaurant.exploration === decisionState.exploration }] : []),
      ...(decisionState.distance !== "unlimited" ? [{ label: "距离", matched: distanceFit }] : []),
      ...requestedFeatures.map(feature => ({ label: featureLabel(feature), matched: restaurant.features.includes(feature) }))
    ];
    const matchedCriteria = criteria.filter(item => item.matched).length;
    const criteriaCount = criteria.length;
    const matchPercent = criteriaCount ? Math.round(matchedCriteria / criteriaCount * 100) : 0;
    const reasons = reasonItems.sort((a, b) => b.priority - a.priority).map(item => item.text);
    return {
      restaurant,
      total,
      score,
      reasons: [...new Set(reasons)].slice(0, 4),
      notes,
      exact: budgetFit && distanceFit,
      matchedCriteria,
      criteriaCount,
      matchPercent
    };
  });

  const exactMatches = scored.filter(item => item.exact);
  return (exactMatches.length ? exactMatches : scored).sort((a, b) => b.score - a.score || restaurantDistanceMeters(a.restaurant) - restaurantDistanceMeters(b.restaurant));
}

function sceneLabel(scene) {
  return ({ date: "约会", daily: "普通吃饭", family: "家庭聚餐", friends: "朋友聚餐", business: "商务请客", travel: "旅游探索" })[scene] || "用餐";
}

function resultSummary(result) {
  if (!result?.criteriaCount) return "综合今天的预算、人数和距离，饭饭更推荐这家。";
  if (result.matchedCriteria === result.criteriaCount) return `你提到的 ${result.criteriaCount} 个条件都对上了。`;
  return `我先按核心条件筛过了，${result.matchedCriteria} / ${result.criteriaCount} 个条件匹配。`;
}

function resultReminder(result) {
  const companions = [...new Set([...decisionState.requirements, ...decisionState.sceneAnswers])]
    .filter(item => ["elder", "children", "pregnant"].includes(item))
    .map(item => ({ elder: "老人", children: "孩子", pregnant: "孕妇" })[item]);
  if (companions.length) {
    const names = companions.length > 1 ? `${companions.slice(0, -1).join("、")}和${companions.at(-1)}` : companions[0];
    return `今天有${names}同行，饭饭会优先考虑更方便一起用餐的餐厅。`;
  }
  return result.notes.length ? `${result.notes.join("；")}。` : "";
}

function featureLabel(feature) {
  const labels = {
    environment: "环境氛围",
    convenient: "距离方便",
    groupSeating: "多人座位"
  };
  return requirementOptions.find(item => item[0] === feature)?.[1] || labels[feature] || feature;
}

function sceneRecommendationReason(restaurant) {
  if (decisionState.scene === "family" && decisionState.sceneAnswers.has("children") && restaurant.features.includes("children")) return "适合家庭聚餐，也能照顾孩子";
  if (decisionState.scene === "family" && decisionState.sceneAnswers.has("elder") && restaurant.features.includes("elder")) return "适合家庭聚餐，对老人更友好";
  if (decisionState.scene === "date" && decisionState.sceneAnswers.has("quiet") && restaurant.features.includes("quiet")) return "适合约会，也方便安静聊天";
  if (decisionState.scene === "business" && decisionState.sceneAnswers.has("privateRoom") && restaurant.features.includes("privateRoom")) return "适合商务请客，并有包间条件";
  if (decisionState.scene === "friends" && decisionState.sceneAnswers.has("groupSeating") && restaurant.features.includes("groupSeating")) return "适合朋友聚餐，也有多人座位";
  if (decisionState.scene === "travel") return "适合在旅行中探索新的味道";
  return "和今天的用餐场景很合拍";
}

function renderDecisionResult() {
  if (!rankedChoices.length) rankedChoices = buildRankedChoices();
  const result = rankedChoices[rankedChoiceIndex % rankedChoices.length];
  const restaurant = result.restaurant;
  return `<section class="decision-result">
    ${guideBlock("我帮你选好了", "不是替你做主，而是先把最合适的一家放到你面前。")}
    <article class="result-restaurant">
      <img src="${restaurant.image}" alt="${restaurant.name}餐厅示意图">
      <div class="result-title"><div><small>${restaurant.cuisine}</small><h2>${restaurant.name}</h2></div><div class="result-badges"><span class="match-badge">匹配 ${result.matchPercent}%</span><span>${restaurantDistanceLabel(restaurant)}</span></div></div>
      <div class="result-facts"><span>人均 ¥${restaurant.price}</span><span>${peopleCount()} 人预计 ¥${result.total}</span></div>
      <div class="result-reasons"><b>为什么推荐它</b><p class="result-summary">${resultSummary(result)}</p><ul>${result.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul></div>
      ${resultReminder(result) ? `<div class="result-note"><b>饭饭提醒</b><p>${resultReminder(result)}</p></div>` : ""}
    </article>
    <div class="result-actions">
      <button class="accept-choice" type="button" data-result-action="accept">就吃这家</button>
      <button type="button" data-result-action="next">再推荐一家</button>
      <button type="button" data-result-action="restart">修改条件</button>
    </div>
  </section>`;
}

function adjustBudget(which, delta) {
  if (which === "min") decisionState.budgetMin = Math.max(0, Math.min(decisionState.budgetMax, decisionState.budgetMin + delta));
  else decisionState.budgetMax = Math.min(1200, Math.max(decisionState.budgetMin, decisionState.budgetMax + delta));
  updateBudgetUI();
}

function updateBudgetUI() {
  const budget = flowStage.querySelector(".budget-conversation");
  if (!budget) return;
  budget.querySelector(".budget-answer strong").innerHTML = `¥${decisionState.budgetMin} <i>～</i> ¥${decisionState.budgetMax}`;
  const range = budget.querySelector(".dual-range");
  range.style.setProperty("--low", `${decisionState.budgetMin / 12}%`);
  range.style.setProperty("--high", `${decisionState.budgetMax / 12}%`);
  range.querySelector('[data-range="min"]').value = decisionState.budgetMin;
  range.querySelector('[data-range="max"]').value = decisionState.budgetMax;
  const values = budget.querySelectorAll(".stepper b");
  values[0].textContent = `¥${decisionState.budgetMin}`;
  values[1].textContent = `¥${decisionState.budgetMax}`;
}

function startHoldAdjustment(button) {
  const natural = Boolean(button.dataset.naturalAdjust);
  const which = button.dataset.naturalAdjust || button.dataset.adjust;
  const adjust = () => natural ? adjustNaturalBudget(which, Number(button.dataset.delta)) : adjustBudget(which, Number(button.dataset.delta));
  adjust();
  holdDelay = setTimeout(() => { holdInterval = setInterval(adjust, 90); }, 420);
}

function stopHoldAdjustment() {
  clearTimeout(holdDelay);
  clearInterval(holdInterval);
}

flowNext.addEventListener("click", () => {
  const message = isStepReady();
  if (message) { showToast(message); return; }
  if (flowStep === 4) {
    rankedChoices = buildRankedChoices();
    rankedChoiceIndex = 0;
  }
  flowDirection = "forward";
  flowStep += 1;
  renderFlow();
  if (flowStep > 4) syncRecommendationSelection(rankedChoices[rankedChoiceIndex]);
});

flowEarly.addEventListener("click", () => {
  rankedChoices = buildRankedChoices();
  rankedChoiceIndex = 0;
  flowDirection = "forward";
  flowStep = 5;
  renderFlow();
  syncRecommendationSelection(rankedChoices[rankedChoiceIndex]);
});

flowBack.addEventListener("click", () => {
  if (flowStep === 0) return;
  flowDirection = "back";
  flowStep -= 1;
  renderFlow();
});

closeDecisionFlow.addEventListener("click", closeFlow);

flowStage.addEventListener("click", event => {
  const choice = event.target.closest("[data-choice]");
  if (choice) {
    const group = choice.dataset.choice;
    if (group === "exploration") decisionState.exploration = Number(choice.dataset.value);
    else if (group === "scene") {
      if (decisionState.scene !== choice.dataset.value) {
        decisionState.sceneAnswers.clear();
        decisionState.scenePriority = null;
      }
      decisionState.scene = choice.dataset.value;
    } else decisionState[group] = choice.dataset.value;
    renderFlow(false);
    const canMoveOn = group !== "party" || choice.dataset.value !== "custom";
    if (canMoveOn) {
      clearTimeout(flowAdvanceTimer);
      flowAdvanceTimer = setTimeout(() => {
        flowDirection = "forward";
        flowStep += 1;
        renderFlow();
      }, 220);
    }
    return;
  }
  const sceneAnswer = event.target.closest("[data-scene-answer]");
  if (sceneAnswer) {
    const value = sceneAnswer.dataset.sceneAnswer;
    decisionState.sceneAnswers.has(value) ? decisionState.sceneAnswers.delete(value) : decisionState.sceneAnswers.add(value);
    renderFlow(false);
    return;
  }
  const scenePriority = event.target.closest("[data-scene-priority]");
  if (scenePriority) {
    decisionState.scenePriority = decisionState.scenePriority === scenePriority.dataset.scenePriority ? null : scenePriority.dataset.scenePriority;
    renderFlow(false);
    return;
  }
  const requirement = event.target.closest("[data-requirement]");
  if (requirement) {
    const value = requirement.dataset.requirement;
    decisionState.requirements.has(value) ? decisionState.requirements.delete(value) : decisionState.requirements.add(value);
    renderFlow(false);
    return;
  }
  const distance = event.target.closest("[data-distance]");
  if (distance) {
    decisionState.distance = distance.dataset.distance;
    renderFlow(false);
    return;
  }
  const resultAction = event.target.closest("[data-result-action]")?.dataset.resultAction;
  if (resultAction === "next") {
    rankedChoiceIndex = (rankedChoiceIndex + 1) % rankedChoices.length;
    renderFlow(false);
    syncRecommendationSelection(rankedChoices[rankedChoiceIndex]);
  } else if (resultAction === "restart") {
    flowStep = 0;
    flowDirection = "back";
    rankedChoices = [];
    renderFlow();
  } else if (resultAction === "accept") {
    const result = rankedChoices[rankedChoiceIndex % rankedChoices.length];
    rememberDecision(result.restaurant.id);
    syncRecommendationSelection(result);
    closeFlow();
  }
});

flowStage.addEventListener("input", event => {
  if (event.target.id === "customPeople") decisionState.customPeople = Math.max(1, Number(event.target.value) || 1);
  if (event.target.id === "customDistance") decisionState.customDistance = Math.max(.1, Number(event.target.value) || .1);
  if (event.target.id === "dietaryNote") decisionState.dietaryNote = event.target.value;
  if (event.target.dataset.range === "min") {
    decisionState.budgetMin = Math.min(Number(event.target.value), decisionState.budgetMax);
    updateBudgetUI();
  }
  if (event.target.dataset.range === "max") {
    decisionState.budgetMax = Math.max(Number(event.target.value), decisionState.budgetMin);
    updateBudgetUI();
  }
});

flowStage.addEventListener("pointerdown", event => {
  const button = event.target.closest("[data-adjust], [data-natural-adjust]");
  if (!button) return;
  event.preventDefault();
  startHoldAdjustment(button);
});
document.addEventListener("pointerup", stopHoldAdjustment);
document.addEventListener("pointercancel", stopHoldAdjustment);
window.addEventListener("blur", stopHoldAdjustment);
flowStage.addEventListener("keydown", event => {
  const button = event.target.closest("[data-adjust], [data-natural-adjust]");
  if (button && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    if (button.dataset.naturalAdjust) adjustNaturalBudget(button.dataset.naturalAdjust, Number(button.dataset.delta));
    else adjustBudget(button.dataset.adjust, Number(button.dataset.delta));
  }
});

let naturalMode = "input";
let naturalText = "";
let naturalBudgetLabel = "";
let naturalUnrecognized = "";
let voicePlaceholderActive = false;

function openNaturalFlow() {
  assistantSheet.hidden = true;
  naturalMode = "input";
  naturalText = "";
  naturalBudgetLabel = "";
  naturalUnrecognized = "";
  voicePlaceholderActive = false;
  decisionFlow.hidden = false;
  appShell.classList.add("immersive-open");
  flowFooter.hidden = true;
  flowStepLabel.textContent = "随时可关闭";
  document.body.classList.add("flow-open");
  renderNaturalFlow();
  setTimeout(() => flowStage.querySelector("#naturalRequest")?.focus(), 80);
}

function renderNaturalFlow() {
  flowStage.className = "flow-stage natural-stage enter-forward";
  if (naturalMode === "input") flowStage.innerHTML = renderNaturalInput();
  else if (naturalMode === "confirm") flowStage.innerHTML = renderNaturalConfirmation();
  else if (naturalMode === "edit") flowStage.innerHTML = renderNaturalEditor();
  else flowStage.innerHTML = renderNaturalResult();
}

function renderNaturalInput() {
  const examples = [
    "两个人约会，想找安静一点，人均100左右",
    "一家人吃饭，有老人和孩子，预算400以内",
    "朋友聚餐，要停车和包间，3公里内",
    "一个人随便吃点，50元以内"
  ];
  return `<section class="natural-input-view">
    ${guideBlock("跟我说说这顿饭吧", "不用一项项填写。像平时说话一样告诉我，剩下的我来整理。")}
    <label class="natural-request-box">
      <span>你今天想怎么吃？</span>
      <textarea id="naturalRequest" rows="4" placeholder="例如：两个人约会，想找安静一点，人均100左右">${escapeHtml(naturalText)}</textarea>
      <small>人数、场景、预算、距离，想到什么说什么</small>
    </label>
    <button class="voice-placeholder${voicePlaceholderActive ? " listening" : ""}" type="button" data-natural-action="voice"><span class="voice-bars" aria-hidden="true"><i></i><i></i><i></i></span><b>${voicePlaceholderActive ? "正在听……" : "按住说说你的需求"}</b><small>${voicePlaceholderActive ? "语音功能目前为交互占位，再点一次结束" : "语音输入将在后续版本接入"}</small></button>
    <button class="understand-button" type="button" data-natural-action="parse">帮我理解</button>
    <div class="request-examples"><p>还没想好？可以点一句试试</p>${examples.map(example => `<button type="button" data-natural-example="${example}">${example}</button>`).join("")}</div>
  </section>`;
}

function resetParsedState() {
  decisionState.party = null;
  decisionState.customPeople = 1;
  decisionState.scene = null;
  decisionState.budgetMin = 0;
  decisionState.budgetMax = 1200;
  decisionState.exploration = 2;
  decisionState.requirements.clear();
  decisionState.sceneAnswers.clear();
  decisionState.scenePriority = null;
  decisionState.dietaryNote = "";
  decisionState.distance = "unlimited";
  decisionState.customDistance = 2;
  naturalBudgetLabel = "";
}

function parseNaturalRequest(text) {
  resetParsedState();
  const compact = text.replace(/\s+/g, "");
  const recognized = [];

  if (/一家人|家庭|全家/.test(compact)) { decisionState.party = "family"; decisionState.customPeople = 4; }
  const peopleMatch = compact.match(/([一二两三四五六七八九十\d]+)(?:个)?人/);
  if (peopleMatch) {
    const count = parseChineseNumber(peopleMatch[1]);
    decisionState.customPeople = count;
    decisionState.party = count === 1 ? "solo" : count === 2 ? "couple" : count <= 5 ? "family" : "group";
    recognized.push(peopleMatch[0]);
  } else if (/一个人|独自|自己吃/.test(compact)) { decisionState.party = "solo"; decisionState.customPeople = 1; }
  else if (/两个人|情侣/.test(compact)) { decisionState.party = "couple"; decisionState.customPeople = 2; }
  else if (/多人|一群人/.test(compact)) { decisionState.party = "group"; decisionState.customPeople = 6; }

  const scenes = [
    ["date", /约会|情侣/], ["business", /商务|请客|客户/], ["family", /家庭|一家人|全家/],
    ["friends", /朋友|聚会|聚餐/], ["travel", /旅游|旅行|游客|探索/], ["daily", /普通|随便|日常|简单吃/]
  ];
  const scene = scenes.find(item => item[1].test(compact));
  if (scene) decisionState.scene = scene[0];

  const budgetRange = compact.match(/(\d{1,4})(?:元)?(?:到|至|[-~～])(\d{1,4})(?:元)?/);
  const perPerson = compact.match(/(?:人均|每人)(\d{1,4})(?:元)?/);
  const budgetSingle = compact.match(/(?:预算|总共|一共)?(\d{1,4})(?:元)(以内|以下|左右|上下)?/);
  if (perPerson) {
    const value = Number(perPerson[1]);
    const count = peopleCount();
    decisionState.budgetMin = Math.max(0, Math.round(value * count * .75 / 10) * 10);
    decisionState.budgetMax = Math.min(1200, Math.round(value * count * 1.25 / 10) * 10);
    naturalBudgetLabel = `人均约 ¥${value}`;
  } else if (budgetRange) {
    decisionState.budgetMin = Number(budgetRange[1]);
    decisionState.budgetMax = Math.max(decisionState.budgetMin, Number(budgetRange[2]));
    naturalBudgetLabel = `总预算 ¥${decisionState.budgetMin}～¥${decisionState.budgetMax}`;
  } else if (budgetSingle) {
    const value = Number(budgetSingle[1]);
    decisionState.budgetMin = budgetSingle[2] === "左右" || budgetSingle[2] === "上下" ? Math.round(value * .7 / 10) * 10 : 0;
    decisionState.budgetMax = Math.min(1200, budgetSingle[2] === "左右" || budgetSingle[2] === "上下" ? Math.round(value * 1.3 / 10) * 10 : value);
    naturalBudgetLabel = `总预算${budgetSingle[2] || ""} ¥${value}`;
  }

  const distance = compact.match(/(\d+(?:\.\d+)?)(公里|千米|km|米)(?:内|以内|左右)?/i);
  if (distance) {
    const meters = Number(distance[1]) * (distance[2] === "米" ? 1 : 1000);
    const presets = [500, 1000, 3000, 5000];
    decisionState.distance = presets.includes(meters) ? String(meters) : "custom";
    decisionState.customDistance = meters / 1000;
  } else if (/附近|就近/.test(compact)) decisionState.distance = "1000";
  else if (/距离不限|多远都行/.test(compact)) decisionState.distance = "unlimited";

  const needs = [
    ["elder", /老人|长辈/], ["children", /孩子|儿童|小孩/], ["pregnant", /孕妇|怀孕/],
    ["parking", /停车|开车/], ["privateRoom", /包间|包厢/], ["quiet", /安静|聊天/], ["dietary", /忌口|过敏|不吃|不能吃/]
  ];
  needs.forEach(item => { if (item[1].test(compact)) decisionState.requirements.add(item[0]); });
  if (/稳一点|稳妥|熟悉/.test(compact)) decisionState.exploration = 1;
  if (/尝鲜|新的|新口味/.test(compact)) decisionState.exploration = 2;
  if (/探索|没吃过|大胆/.test(compact)) decisionState.exploration = 3;

  naturalUnrecognized = !decisionState.party && !decisionState.scene && !naturalBudgetLabel && decisionState.requirements.size === 0
    ? "这句话里暂时没有识别到明确条件，你可以直接修改，或者换种说法。" : "";
}

function parseChineseNumber(value) {
  if (/^\d+$/.test(value)) return Math.max(1, Number(value));
  const numbers = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (numbers[tens] || 1) * 10 + (numbers[ones] || 0);
  }
  return numbers[value] || 1;
}

function conditionSummary() {
  const items = [];
  const partyLabels = { solo: "1人", couple: "2人", family: `${decisionState.customPeople || 4}人/家庭`, group: `${decisionState.customPeople || 6}人/聚餐`, custom: `${decisionState.customPeople || 1}人` };
  const sceneLabels = { date: "约会", daily: "普通吃饭", family: "家庭聚餐", friends: "朋友聚会", business: "商务请客", travel: "旅游探索" };
  if (decisionState.party) items.push(["人数", partyLabels[decisionState.party]]);
  if (decisionState.scene) items.push(["场景", sceneLabels[decisionState.scene]]);
  if (naturalBudgetLabel) items.push(["预算", naturalBudgetLabel]);
  if (decisionState.distance !== "unlimited") items.push(["距离", decisionState.distance === "custom" ? `${decisionState.customDistance}公里内` : `${formatDistance(Number(decisionState.distance))}内`]);
  const requirementLabels = {
    dietary: ["忌口", "有忌口"], parking: ["停车", "需要停车"], elder: ["老人", "有老人同行"],
    children: ["孩子", "有孩子同行"], pregnant: ["孕妇", "有孕妇同行"], quiet: ["安静", "希望安静"], privateRoom: ["包间", "需要包间"]
  };
  decisionState.requirements.forEach(item => { if (requirementLabels[item]) items.push(requirementLabels[item]); });
  return items;
}

function renderNaturalConfirmation() {
  const items = conditionSummary();
  return `<section class="natural-confirm-view">
    ${guideBlock("我理解的是这些，对吗？", "先和你确认一下。没说到的条件，我不会替你做主。")}
    <article class="understanding-card">
      ${items.length ? `<div class="understanding-items">${items.map(item => `<div><small>${item[0]}</small><b>${item[1]}</b></div>`).join("")}</div>` : `<p class="nothing-understood">饭饭还没有抓到明确条件。</p>`}
      ${!decisionState.party ? `<p class="assumption-note">没有说明人数，价格暂按 1 人估算。</p>` : ""}
      ${naturalUnrecognized ? `<p class="assumption-note warning">${naturalUnrecognized}</p>` : ""}
    </article>
    <div class="confirmation-actions">
      <button class="confirm-understanding" type="button" data-natural-action="confirm">确认这些条件</button>
      <button type="button" data-natural-action="edit">修改一下</button>
      <button class="text-action" type="button" data-natural-action="rephrase">重新说一句</button>
    </div>
  </section>`;
}

function editChoiceButtons(options, selected, name) {
  return `<div class="edit-choice-row">${options.map(option => `<button type="button" data-natural-choice="${name}" data-value="${option[0]}" class="${selected === option[0] ? "selected" : ""}">${option[1]}</button>`).join("")}</div>`;
}

function renderNaturalEditor() {
  const explorationOptions = [["1", "稳一点"], ["2", "尝点新的"], ["3", "探索一下"]];
  return `<section class="natural-editor">
    ${guideBlock("需要改哪里，告诉我就好", "只调整你在意的部分，其他都可以留给饭饭。")}
    <div class="edit-section"><h3>一起吃饭的人</h3>${editChoiceButtons(partyOptions, decisionState.party, "party")}${decisionState.party === "custom" ? `<label class="custom-field compact"><span>具体人数</span><input id="customPeople" type="number" min="1" max="30" value="${decisionState.customPeople}"><small>人</small></label>` : ""}</div>
    <div class="edit-section"><h3>今天的情况</h3>${editChoiceButtons(sceneOptions, decisionState.scene, "scene")}</div>
    <div class="edit-section"><h3>这顿饭预计花多少？</h3>${renderEditBudget()}</div>
    <div class="edit-section"><h3>距离</h3>${editChoiceButtons(distanceOptions, decisionState.distance, "distance")}${decisionState.distance === "custom" ? `<label class="custom-field compact"><span>最远接受</span><input id="customDistance" type="number" min=".1" max="50" step=".1" value="${decisionState.customDistance}"><small>公里</small></label>` : ""}</div>
    <div class="edit-section"><h3>需要照顾的地方</h3><div class="edit-choice-row">${requirementOptions.map(option => `<button type="button" data-natural-requirement="${option[0]}" class="${decisionState.requirements.has(option[0]) ? "selected" : ""}">${option[1]}</button>`).join("")}</div></div>
    <div class="edit-section"><h3>今天想怎么尝试？</h3>${editChoiceButtons(explorationOptions, String(decisionState.exploration), "exploration")}</div>
    <button class="save-conditions" type="button" data-natural-action="save">保存，按这些找</button>
  </section>`;
}

function renderEditBudget() {
  return `<div class="budget-conversation compact-budget">
    <div class="budget-answer"><strong>¥${decisionState.budgetMin} <i>～</i> ¥${decisionState.budgetMax}</strong></div>
    <div class="dual-range" style="--low:${decisionState.budgetMin / 12}%;--high:${decisionState.budgetMax / 12}%"><div class="range-track"></div><input type="range" min="0" max="1200" step="10" value="${decisionState.budgetMin}" data-natural-range="min" aria-label="最低预算"><input type="range" min="0" max="1200" step="10" value="${decisionState.budgetMax}" data-natural-range="max" aria-label="最高预算"></div>
    <div class="budget-adjustments"><div><span>最低预算</span><div class="stepper"><button type="button" data-natural-adjust="min" data-delta="-1">−</button><b>¥${decisionState.budgetMin}</b><button type="button" data-natural-adjust="min" data-delta="1">＋</button></div></div><div><span>最高预算</span><div class="stepper"><button type="button" data-natural-adjust="max" data-delta="-1">−</button><b>¥${decisionState.budgetMax}</b><button type="button" data-natural-adjust="max" data-delta="1">＋</button></div></div>
  </div>`;
}

function renderNaturalResult() {
  if (!rankedChoices.length) rankedChoices = buildRankedChoices();
  const result = rankedChoices[rankedChoiceIndex % rankedChoices.length];
  const restaurant = result.restaurant;
  return `<section class="decision-result natural-result">
    ${guideBlock("我先帮你选了这一家", "理由都写在下面。你可以接受，也可以让我换一家。")}
    <article class="result-restaurant"><img src="${restaurant.image}" alt="${restaurant.name}餐厅示意图"><div class="result-title"><div><small>${restaurant.cuisine}</small><h2>${restaurant.name}</h2></div><div class="result-badges"><span class="match-badge">匹配 ${result.matchPercent}%</span><span>${restaurantDistanceLabel(restaurant)}</span></div></div><div class="result-facts"><span>人均 ¥${restaurant.price}</span><span>${peopleCount()} 人预计 ¥${result.total}</span></div><div class="result-reasons"><b>为什么推荐它</b><p class="result-summary">${resultSummary(result)}</p><ul>${result.reasons.map(reason => `<li>${reason}</li>`).join("")}</ul></div>${resultReminder(result) ? `<div class="result-note"><b>饭饭提醒</b><p>${resultReminder(result)}</p></div>` : ""}</article>
    <div class="result-actions"><button class="accept-choice" type="button" data-natural-action="accept">就吃这家</button><button type="button" data-natural-action="next-result">再推荐一家</button><button type="button" data-natural-action="restart">修改条件</button></div>
  </section>`;
}

function adjustNaturalBudget(which, delta) {
  if (which === "min") decisionState.budgetMin = Math.max(0, Math.min(decisionState.budgetMax, decisionState.budgetMin + delta));
  else decisionState.budgetMax = Math.min(1200, Math.max(decisionState.budgetMin, decisionState.budgetMax + delta));
  naturalBudgetLabel = `总预算 ¥${decisionState.budgetMin}～¥${decisionState.budgetMax}`;
  updateNaturalBudgetUI();
}

function updateNaturalBudgetUI() {
  const budget = flowStage.querySelector(".budget-conversation");
  if (!budget) return;
  budget.querySelector(".budget-answer strong").innerHTML = `¥${decisionState.budgetMin} <i>～</i> ¥${decisionState.budgetMax}`;
  const range = budget.querySelector(".dual-range");
  range.style.setProperty("--low", `${decisionState.budgetMin / 12}%`);
  range.style.setProperty("--high", `${decisionState.budgetMax / 12}%`);
  range.querySelector('[data-natural-range="min"]').value = decisionState.budgetMin;
  range.querySelector('[data-natural-range="max"]').value = decisionState.budgetMax;
  const values = budget.querySelectorAll(".stepper b");
  values[0].textContent = `¥${decisionState.budgetMin}`;
  values[1].textContent = `¥${decisionState.budgetMax}`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

flowStage.addEventListener("click", event => {
  const naturalTarget = event.target.closest("[data-natural-action], [data-natural-example], [data-natural-choice], [data-natural-requirement], [data-natural-adjust]");
  if (!naturalTarget) return;
  event.stopPropagation();

  if (naturalTarget.dataset.naturalExample) {
    naturalText = naturalTarget.dataset.naturalExample;
    renderNaturalFlow();
    flowStage.querySelector("#naturalRequest")?.focus();
    return;
  }
  if (naturalTarget.dataset.naturalChoice) {
    const group = naturalTarget.dataset.naturalChoice;
    const value = naturalTarget.dataset.value;
    if (group === "exploration") decisionState.exploration = Number(value);
    else if (group === "distance") decisionState.distance = value;
    else {
      decisionState[group] = value;
      if (group === "party" && value === "solo") decisionState.customPeople = 1;
      if (group === "party" && value === "couple") decisionState.customPeople = 2;
      if (group === "party" && value === "family") decisionState.customPeople = 4;
      if (group === "party" && value === "group") decisionState.customPeople = 6;
    }
    renderNaturalFlow();
    return;
  }
  if (naturalTarget.dataset.naturalRequirement) {
    const value = naturalTarget.dataset.naturalRequirement;
    decisionState.requirements.has(value) ? decisionState.requirements.delete(value) : decisionState.requirements.add(value);
    renderNaturalFlow();
    return;
  }
  if (naturalTarget.dataset.naturalAdjust) {
    return;
  }

  const action = naturalTarget.dataset.naturalAction;
  if (action === "voice") {
    voicePlaceholderActive = !voicePlaceholderActive;
    renderNaturalFlow();
    return;
  } else if (action === "parse") {
    naturalText = flowStage.querySelector("#naturalRequest")?.value.trim() || "";
    if (!naturalText) { showToast("先跟饭饭说一句今天想怎么吃吧"); return; }
    parseNaturalRequest(naturalText);
    naturalMode = "confirm";
  } else if (action === "confirm" || action === "save") {
    rankedChoices = buildRankedChoices(); rankedChoiceIndex = 0; naturalMode = "result";
  } else if (action === "edit") {
    flowStep = 0;
    flowDirection = "forward";
    renderFlow();
    return;
  }
  else if (action === "rephrase" || action === "restart") naturalMode = "input";
  else if (action === "next-result") rankedChoiceIndex = (rankedChoiceIndex + 1) % rankedChoices.length;
  else if (action === "accept") {
    const result = rankedChoices[rankedChoiceIndex % rankedChoices.length];
    rememberDecision(result.restaurant.id);
    syncRecommendationSelection(result);
    closeFlow();
    return;
  }
  renderNaturalFlow();
  if (naturalMode === "result") syncRecommendationSelection(rankedChoices[rankedChoiceIndex]);
}, true);

flowStage.addEventListener("input", event => {
  if (event.target.id === "naturalRequest") naturalText = event.target.value;
  if (event.target.id === "customPeople") decisionState.customPeople = Math.max(1, Number(event.target.value) || 1);
  if (event.target.id === "customDistance") decisionState.customDistance = Math.max(.1, Number(event.target.value) || .1);
  if (event.target.dataset.naturalRange === "min") decisionState.budgetMin = Math.min(Number(event.target.value), decisionState.budgetMax);
  if (event.target.dataset.naturalRange === "max") decisionState.budgetMax = Math.max(Number(event.target.value), decisionState.budgetMin);
  if (event.target.dataset.naturalRange) {
    naturalBudgetLabel = `总预算 ¥${decisionState.budgetMin}～¥${decisionState.budgetMax}`;
    updateNaturalBudgetUI();
  }
}, true);

function scheduleFirstOnboarding() {
  let shouldShow = true;
  try {
    const key = "nearby-food-v2-onboarding-shown";
    shouldShow = !localStorage.getItem(key);
    if (shouldShow) localStorage.setItem(key, "1");
  } catch (error) {
    shouldShow = true;
  }
  if (shouldShow) setTimeout(startOnboarding, 650);
}

render();
updateHistoryCount();
initRealMap();
scheduleFirstOnboarding();
