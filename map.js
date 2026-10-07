(function () {
  let mapInstance = null;
  let geolocation = null;
  let loaderPromise = null;
  let amapApi = null;
  let restaurantMarkers = new Map();
  let restaurantInfoWindow = null;
  let selectedRestaurantId = null;

  function loadLoaderScript() {
    if (window.AMapLoader) return Promise.resolve(window.AMapLoader);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://webapi.amap.com/loader.js";
      script.async = true;
      script.charset = "utf-8";
      script.onload = () => window.AMapLoader
        ? resolve(window.AMapLoader)
        : reject({ code: "LOAD_FAILED", message: "高德地图加载器初始化失败" });
      script.onerror = () => reject({ code: "LOAD_FAILED", message: "高德地图加载器加载失败，请检查网络" });
      document.head.appendChild(script);
    });
  }

  function loadAmap(config) {
    if (loaderPromise) return loaderPromise;
    const key = typeof config?.key === "string" ? config.key.trim() : "";
    const securityJsCode = typeof config?.securityJsCode === "string" ? config.securityJsCode.trim() : "";
    if (!key || !securityJsCode) {
      return Promise.reject({ code: "CONFIG_MISSING", message: "尚未配置高德地图 Key 和安全密钥" });
    }

    window._AMapSecurityConfig = { securityJsCode };
    loaderPromise = loadLoaderScript()
      .then(AMapLoader => AMapLoader.load({
        key,
        version: "2.0",
        plugins: ["AMap.Geolocation"]
      }))
      .catch(error => {
      loaderPromise = null;
      if (error?.code) throw error;
      throw { code: "LOAD_FAILED", message: error?.message || "地图服务加载失败，请检查 Key 和安全密钥", detail: error };
    });
    return loaderPromise;
  }

  function loadGeolocation(AMap) {
    return new Promise((resolve, reject) => {
      AMap.plugin("AMap.Geolocation", () => {
        try {
          geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            zoomToAccuracy: true,
            showButton: false,
            showMarker: true,
            showCircle: true,
            panToLocation: true
          });
          mapInstance.addControl(geolocation);
          resolve();
        } catch (error) {
          reject({ code: "PLUGIN_FAILED", message: "定位组件加载失败", detail: error });
        }
      });
    });
  }

  function locate() {
    if (!geolocation) return Promise.reject({ code: "NOT_READY", message: "地图定位尚未准备好" });
    return new Promise((resolve, reject) => {
      geolocation.getCurrentPosition((status, result) => {
        if (status === "complete") {
          resolve({
            lng: result.position.lng,
            lat: result.position.lat,
            accuracy: result.accuracy,
            raw: result
          });
        } else {
          const denied = /denied|permission|拒绝|权限/i.test(`${result?.message || ""} ${result?.originMessage || ""}`);
          reject({
            code: denied ? "PERMISSION_DENIED" : "LOCATION_FAILED",
            message: denied ? "位置权限未开启，请在浏览器设置中允许定位" : "暂时无法获取你的位置，请稍后重试",
            detail: result
          });
        }
      });
    });
  }

  async function init(container, config) {
    const AMap = await loadAmap(config);
    amapApi = AMap;
    mapInstance = new AMap.Map(container, {
      zoom: 13,
      viewMode: "2D",
      resizeEnable: true
    });
    await loadGeolocation(AMap);
    return mapInstance;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function markerElement(restaurant) {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "amap-restaurant-marker";
    element.setAttribute("aria-label", `查看${restaurant.name}`);
    element.innerHTML = `<span></span><small>${escapeHtml(restaurant.name)}</small>`;
    return element;
  }

  function infoWindowContent(restaurant) {
    return `<article class="amap-restaurant-info">
      <div><small>${escapeHtml(restaurant.cuisine)}</small><span>模拟数据</span></div>
      <h3>${escapeHtml(restaurant.name)}</h3>
      <p>人均 ¥${escapeHtml(restaurant.price)} · ${escapeHtml(restaurant.displayDistanceText)}</p>
    </article>`;
  }

  function clearRestaurantMarkers() {
    if (mapInstance && restaurantMarkers.size) {
      mapInstance.remove([...restaurantMarkers.values()].map(entry => entry.marker));
    }
    restaurantMarkers.clear();
    restaurantInfoWindow?.close();
    selectedRestaurantId = null;
  }

  function setRestaurantMarkers(restaurants, onSelect) {
    if (!mapInstance || !amapApi) return false;
    clearRestaurantMarkers();
    restaurantInfoWindow = new amapApi.InfoWindow({
      isCustom: true,
      closeWhenClickMap: true,
      offset: new amapApi.Pixel(0, -34)
    });

    restaurants.forEach(restaurant => {
      if (!Number.isFinite(restaurant.location?.lng) || !Number.isFinite(restaurant.location?.lat)) return;
      const element = markerElement(restaurant);
      const marker = new amapApi.Marker({
        position: [restaurant.location.lng, restaurant.location.lat],
        anchor: "bottom-center",
        content: element,
        title: restaurant.name
      });
      marker.on("click", () => {
        focusRestaurant(restaurant.id, { center: false, openInfo: true });
        onSelect?.(restaurant.id);
      });
      restaurantMarkers.set(restaurant.id, { marker, element, restaurant });
      mapInstance.add(marker);
    });
    return true;
  }

  function focusRestaurant(id, options = {}) {
    const entry = restaurantMarkers.get(id);
    if (!entry || !mapInstance) return false;
    selectedRestaurantId = id;
    restaurantMarkers.forEach((value, markerId) => value.element.classList.toggle("selected", markerId === id));
    if (options.center !== false) mapInstance.panTo(entry.marker.getPosition());
    if (options.openInfo !== false && restaurantInfoWindow) {
      restaurantInfoWindow.setContent(infoWindowContent(entry.restaurant));
      restaurantInfoWindow.open(mapInstance, entry.marker.getPosition());
    }
    return true;
  }

  function resize() {
    mapInstance?.resize();
  }

  function destroy() {
    clearRestaurantMarkers();
    mapInstance?.destroy();
    mapInstance = null;
    geolocation = null;
    amapApi = null;
  }

  window.NearbyFoodMap = { init, locate, resize, setRestaurantMarkers, clearRestaurantMarkers, focusRestaurant, destroy };
})();
