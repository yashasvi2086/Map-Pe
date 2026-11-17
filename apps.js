/**
 * app.js
 * ------------------------------------------------------------------
 * Application logic for the MapPe Crime Detection & Rate Prediction
 * Dashboard. Organized as small, single-purpose functions:
 *   - state management
 *   - filtering
 *   - map rendering (clustered markers + heatmap mode)
 *   - analytical widgets (KPIs, donut chart, safety gauge)
 * Every render* function takes the already-filtered dataset and
 * updates exactly one part of the UI, so filters can call them
 * together without hidden coupling.
 * ------------------------------------------------------------------
 */

// "Today" is pinned to the dashboard's reference date so the mock
// dataset's relative dates (this week / last month) stay meaningful.
const TODAY = new Date("2026-07-05T00:00:00");

const SEVERITY_COLOR = {
  Low: "#E8A33D",
  Medium: "#C1502E",
  High: "#7A1F2B"
};

const SEVERITY_WEIGHT = { Low: 1, Medium: 2.1, High: 3.6 };

const state = {
  region: "all",
  activeTypes: new Set(CRIME_TYPES),
  lookbackDays: 90,
  mapMode: "cluster", // "cluster" | "heat"

  // --- Live alerts ---
  liveTracking: false,       // is geolocation watch active
  usingFallbackLocation: false, // true if we couldn't get real GPS
  userPosition: null,        // { lat, lng }
  alertRadiusMeters: 500,
  liveIncidents: [],         // incidents "reported" this session
  alertedIds: new Set(),     // ids already toasted, so we don't repeat

  // --- Navigation ---
  destination: null,         // { lat, lng, label }
  pickingDestination: false, // map is in "click to drop pin" mode
  navigating: false,
  routeSummary: null,        // { distanceMeters, durationSeconds }
  routeSteps: [],
  lastRouteFetchAt: 0,
  lastRouteFetchPos: null,

  // Two features can each want the GPS watch running; keep it alive
  // as long as either one needs it.
  trackers: { alerts: false, navigation: false }
};

let map, clusterLayer, heatLayer, donutChart, liveLayer, userMarker, destinationMarker, routeLine;
let watchId = null;
let liveSpawnTimer = null;
let historicalMapKey = null;
const liveMarkers = new Map();
const MAX_SIMULATED_INCIDENTS = 60;

/* ------------------------------ Helpers ------------------------------ */

function daysBetween(dateA, dateB) {
  return Math.floor((dateA - dateB) / (1000 * 60 * 60 * 24));
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Great-circle distance in meters between two lat/lng points.
function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Returns a lat/lng offset from an origin point by a distance (m) and bearing (deg).
function offsetCoords(lat, lng, meters, bearingDeg) {
  const R = 6371000;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const newLat = lat + ((meters * Math.cos(bearing)) / R) * (180 / Math.PI);
  const newLng =
    lng + ((meters * Math.sin(bearing)) / (R * Math.cos(latRad))) * (180 / Math.PI);
  return { lat: newLat, lng: newLng };
}

function timeAgoLabel(ts) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
}

function isWithinLookback(record) {
  const start = new Date(TODAY);
  start.setDate(start.getDate() - state.lookbackDays);
  const end = new Date(TODAY);
  end.setDate(end.getDate() + 1);
  const timestamp = new Date(record.timestamp);
  return timestamp >= start && timestamp < end;
}

function getFilteredData() {
  return CRIME_DATA.filter((record) => {
    const regionMatch = state.region === "all" || record.location_name === state.region;
    const typeMatch = state.activeTypes.has(record.type);
    return regionMatch && typeMatch && isWithinLookback(record);
  });
}

/* ------------------------------- Map ------------------------------- */

function initMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true, preferCanvas: true, minZoom: 2, maxZoom: 19 }).setView(
    [CITY_CENTER.lat, CITY_CENTER.lng],
    13
  );

  // Use the standard raster map with a normal HTTP website referrer.
  // Basemap failure must not interrupt dashboard initialization.
  const baseMap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 2,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  });
  baseMap.addTo(map);
  clusterLayer = L.markerClusterGroup({
    iconCreateFunction: clusterIcon,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    animate: false
  });
  map.addLayer(clusterLayer);

  // The bundled heat plugin does not cancel a queued redraw when detached.
  const DashboardHeatLayer = L.HeatLayer.extend({
    onRemove(leafletMap) {
      L.Util.cancelAnimFrame(this._frame);
      this._frame = null;
      L.HeatLayer.prototype.onRemove.call(this, leafletMap);
    }
  });
  heatLayer = new DashboardHeatLayer([], { radius: 28, blur: 22, maxZoom: 15, minOpacity: 0.35 });

  // Live incidents sit on their own layer so they stay visible
  // regardless of the historical filters (region/type/timeframe).
  liveLayer = L.layerGroup();
  map.addLayer(liveLayer);

  routeLine = L.polyline([], { color: "#2C5C8A", weight: 5, opacity: 0.85, lineJoin: "round" });
  routeLine.addTo(map);

  map.on("click", (e) => {
    if (!state.pickingDestination) return;
    setDestination(e.latlng.lat, e.latlng.lng, "Dropped pin");
    setPickingDestination(false);
  });
}

function youAreHereIcon() {
  return L.divIcon({
    className: "",
    iconSize: [22, 22],
    html: `
      <div style="position:relative;width:22px;height:22px;">
        <div class="you-are-here-ping"></div>
        <div style="
          position:absolute;top:5px;left:5px;width:12px;height:12px;border-radius:999px;
          background:#2C5C8A;border:2px solid #fff;box-shadow:0 1px 4px rgba(20,32,46,0.45);
        "></div>
      </div>`
  });
}

function destinationIcon() {
  return L.divIcon({
    className: "",
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    html: `
      <svg width="26" height="34" viewBox="0 0 26 34" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 0C5.8 0 0 5.8 0 13c0 9.3 13 21 13 21s13-11.7 13-21C26 5.8 20.2 0 13 0Z" fill="#7A1F2B"/>
        <circle cx="13" cy="13" r="5" fill="#fff"/>
      </svg>`
  });
}

function updateUserMarker() {
  if (!state.userPosition) return;
  const latlng = [state.userPosition.lat, state.userPosition.lng];
  if (!userMarker) {
    userMarker = L.marker(latlng, { icon: youAreHereIcon(), zIndexOffset: 1000 }).addTo(map);
  } else {
    userMarker.setLatLng(latlng);
  }
}

function livePulseIcon(severity) {
  const color = SEVERITY_COLOR[severity];
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    html: `
      <div style="position:relative;width:26px;height:26px;">
        <div class="live-ping" style="background:${color};"></div>
        <div style="
          position:absolute;top:6px;left:6px;width:14px;height:14px;border-radius:999px;
          background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(20,32,46,0.45);
        "></div>
      </div>`
  });
}

function clusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count > 12 ? 46 : count > 6 ? 38 : 32;
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:999px;
      background:var(--primary-deep, #1F4568);
      color:#fff;display:flex;align-items:center;justify-content:center;
      font-family:var(--font-display, sans-serif);font-weight:600;
      font-size:${count > 12 ? 14 : 13}px;
      box-shadow:0 4px 10px rgba(20,32,46,0.35);border:2px solid rgba(255,255,255,0.85);
    ">${count}</div>`,
    className: "",
    iconSize: [size, size]
  });
}

function severityRadius(severity) {
  return severity === "High" ? 9 : severity === "Medium" ? 7.5 : 6;
}

function renderMap(data) {
  const route = document.body.dataset.workspace === 'route';
  const heat = state.mapMode === 'heat';
  document.getElementById('severity-legend').hidden = heat && !route;
  document.getElementById('heat-legend').hidden = !heat || route;
  if (route || document.body.dataset.analysis === 'expanded') return;
  const key = data.map(record => record.id).join(',');
  // Keep existing markers while switching views; only rebuild when filters change.
  if (key !== historicalMapKey) {
    historicalMapKey = key;
    clusterLayer.clearLayers();
    data.forEach(record => {
      const marker = L.circleMarker([record.latitude, record.longitude], {
        radius: severityRadius(record.severity), color: '#fff', weight: 1.5,
        fillColor: SEVERITY_COLOR[record.severity], fillOpacity: 0.9
      });
      marker.bindPopup(popupHtml(record));
      clusterLayer.addLayer(marker);
    });
  }

  if (state.mapMode === "cluster") {
    if (!map.hasLayer(clusterLayer)) map.addLayer(clusterLayer);
    if (map.hasLayer(heatLayer)) map.removeLayer(heatLayer);

  } else {
    if (map.hasLayer(clusterLayer)) map.removeLayer(clusterLayer);
    if (!map.hasLayer(heatLayer)) map.addLayer(heatLayer);
    // Only redraw while attached: Leaflet clears _map when a layer is removed.
    const weights = {Low: 0.4, Medium: 0.7, High: 1};
    heatLayer.setLatLngs(data.map(r => [r.latitude, r.longitude, weights[r.severity]]));

  }
  if (typeof forecastLayer !== 'undefined' && forecastLayer) {
    if (heat) map.removeLayer(forecastLayer);
    else if (!map.hasLayer(forecastLayer)) forecastLayer.addTo(map);
  }
}

function popupHtml(record) {
  const color = SEVERITY_COLOR[record.severity];
  return `
    <div style="min-width:180px">
      <div style="font-family:var(--font-display);font-weight:700;font-size:14px;color:#14202E;margin-bottom:2px;">
        ${record.type}
      </div>
      <div style="color:#33465A;margin-bottom:6px;">${record.location_name}</div>
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <span style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block;"></span>
        <span style="font-size:12px;color:#33465A;">${record.severity} severity</span>
      </div>
      <div style="font-size:12px;color:#7C8A99;">${formatDate(record.timestamp)}</div>
    </div>
  `;
}

/* ------------------------------ KPIs ------------------------------ */

function renderKPIs(data) {
  document.getElementById("kpi-total").textContent = data.length;

  const midpoint = TODAY.getTime() - (state.lookbackDays / 2) * 86400000;
  const recentHalf = data.filter((r) => new Date(r.timestamp).getTime() >= midpoint).length;
  const priorHalf = data.length - recentHalf;
  let changeLabel = "No prior data";
  let changeColor = "text-slate-400";
  if (priorHalf > 0) {
    const pct = Math.round(((recentHalf - priorHalf) / priorHalf) * 100);
    changeLabel = `${pct > 0 ? "+" : ""}${pct}% vs. prior period`;
    changeColor = pct > 0 ? "text-[#7A1F2B]" : pct < 0 ? "text-[#2C5C8A]" : "text-slate-400";
  } else if (recentHalf > 0) {
    changeLabel = "New activity this period";
  }
  const changeEl = document.getElementById("kpi-change");
  changeEl.textContent = changeLabel;
  changeEl.className = `text-xs font-medium mt-1 ${changeColor}`;

  const counts = {};
  data.forEach((r) => (counts[r.type] = (counts[r.type] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("kpi-top-type").textContent = top ? top[0] : "—";
  document.getElementById("kpi-top-type-sub").textContent = top
    ? `${top[1]} of ${data.length} incidents`
    : "No incidents in range";
}

/* ------------------------------ Chart ------------------------------ */

function renderChart(data) {
  if (!document.getElementById('history-panel')?.open) return;
  const counts = {};
  CRIME_TYPES.forEach((t) => (counts[t] = 0));
  data.forEach((r) => (counts[r.type] += 1));

  const labels = CRIME_TYPES.filter((t) => counts[t] > 0);
  const values = labels.map((t) => counts[t]);
  const palette = ["#2C5C8A", "#4C7FA8", "#E8A33D", "#C1502E", "#7A1F2B", "#6B7C8F"];

  const ctx = document.getElementById("breakdown-chart").getContext("2d");

  if (labels.length === 0) {
    document.getElementById("chart-empty").classList.remove("hidden");
    if (donutChart) { donutChart.data.labels = []; donutChart.data.datasets[0].data = []; donutChart.update('none'); }
    return;
  }
  document.getElementById("chart-empty").classList.add("hidden");

  if (donutChart) {
    donutChart.data.labels = labels;
    donutChart.data.datasets[0].data = values;
    donutChart.data.datasets[0].backgroundColor = labels.map(t => palette[CRIME_TYPES.indexOf(t)]);
    donutChart.update('none');
    return;
  }

  donutChart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map(t => palette[CRIME_TYPES.indexOf(t)]),
          borderColor: "#ffffff",
          borderWidth: 2,
          hoverOffset: 6
        }
      ]
    },
    options: {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      cutout: "68%",
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            pointStyle: "circle",
            padding: 12,
            font: { family: "Inter", size: 11 },
            color: "#33465A"
          }
        },
        tooltip: {
          backgroundColor: "#14202E",
          titleFont: { family: "Plus Jakarta Sans", weight: "600" },
          bodyFont: { family: "Inter" },
          padding: 10,
          cornerRadius: 8
        }
      }
    }
  });
}

/* --------------------------- Safety Gauge --------------------------- */

function computeSafetyScore(data) {
  if (data.length === 0) return 92; // no incidents recorded -> high confidence, not a claim of zero crime
  const totalWeight = data.reduce((sum, r) => sum + SEVERITY_WEIGHT[r.severity], 0);
  const avgWeight = totalWeight / data.length;
  const densityPenalty = Math.min(28, data.length * 0.9);
  const severityPenalty = (avgWeight / 3.6) * 45;
  const score = Math.max(6, Math.min(97, 100 - severityPenalty - densityPenalty));
  return Math.round(score);
}

function safetyTier(score) {
  if (score >= 75) return { label: "Generally Calm", color: "#2C5C8A", tip: "Reported incidents are low and mild in this period. Standard evening awareness is still recommended." };
  if (score >= 50) return { label: "Moderate Watch", color: "#E8A33D", tip: "Incident activity is moderate. Stay alert in low-traffic areas after dark and secure vehicles and entryways." };
  if (score >= 30) return { label: "Elevated Caution", color: "#C1502E", tip: "Incident density is elevated for this area and period. Favor well-lit, populated routes and report suspicious activity promptly." };
  return { label: "High Alert", color: "#7A1F2B", tip: "Multiple high-severity incidents were reported. Coordinate with neighbors, avoid isolated routes at night, and contact local authorities with any concerns." };
}

function renderSafety(data, regionLabel) {
  const score = computeSafetyScore(data);
  const tier = safetyTier(score);

  const circumference = 2 * Math.PI * 54; // r=54
  const arcFraction = 0.75; // gauge sweeps 270 degrees
  const usable = circumference * arcFraction;
  const filled = (score / 100) * usable;

  const arc = document.getElementById("gauge-value-arc");
  arc.setAttribute("stroke-dasharray", `${filled} ${circumference - filled}`);
  arc.setAttribute("stroke", tier.color);

  document.getElementById("gauge-score").textContent = score;
  document.getElementById("gauge-label").textContent = tier.label;
  document.getElementById("gauge-label").style.color = tier.color;
  document.getElementById("safety-tip").textContent = tier.tip;
  document.getElementById("safety-region-name").textContent = regionLabel;
}

/* ------------------------------ Live Alerts ------------------------------ */

function liveIncidentPopupHtml(incident) {
  const color = SEVERITY_COLOR[incident.severity];
  return `
    <div style="min-width:180px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <span style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block;"></span>
        <span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.02em;">Live report</span>
      </div>
      <div style="font-family:var(--font-display);font-weight:700;font-size:14px;color:#14202E;margin-bottom:2px;">
        ${incident.type}
      </div>
      <div style="color:#33465A;margin-bottom:6px;">${incident.blurb}</div>
      <div style="font-size:12px;color:#7C8A99;">${timeAgoLabel(incident.timestamp)}</div>
    </div>
  `;
}

function addLiveIncidentToMap(incident) {
  const marker = L.marker([incident.latitude, incident.longitude], {
    icon: livePulseIcon(incident.severity)
  });
  marker.bindPopup(liveIncidentPopupHtml(incident));
  liveLayer.addLayer(marker);
  liveMarkers.set(incident.id, marker);
}

function updateLiveBadge() {
  const badge = document.getElementById("live-count-badge");
  if (!badge) return;
  badge.textContent = state.liveIncidents.length;
  badge.classList.toggle("hidden", state.liveIncidents.length === 0);
}

// Picks a hardcoded template, stamps it with the real current time, and
// places it near the tracked user (or a random neighborhood if we don't
// have a fix yet), then checks whether it should trigger a toast.
function spawnLiveIncident() {
  // Bound map markers and proximity checks during long-running demos.
  while (state.liveIncidents.length >= MAX_SIMULATED_INCIDENTS) {
    const oldest = state.liveIncidents.shift();
    const marker = liveMarkers.get(oldest.id);
    if (marker) liveLayer.removeLayer(marker);
    liveMarkers.delete(oldest.id);
    state.alertedIds.delete(oldest.id);
  }
  const template = LIVE_INCIDENT_TEMPLATES[Math.floor(Math.random() * LIVE_INCIDENT_TEMPLATES.length)];

  let origin;
  if (state.userPosition) {
    origin = state.userPosition;
  } else {
    const names = Object.keys(NEIGHBORHOOD_CENTERS);
    origin = NEIGHBORHOOD_CENTERS[names[Math.floor(Math.random() * names.length)]];
    origin = { lat: origin.lat, lng: origin.lng };
  }

  // Scatter it 80m–1200m away in a random direction so it isn't
  // always literally on top of the user.
  const distance = 80 + Math.random() * 1120;
  const bearing = Math.random() * 360;
  const { lat, lng } = offsetCoords(origin.lat, origin.lng, distance, bearing);

  const incident = {
    id: `live-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: template.type,
    severity: template.severity,
    blurb: template.blurb,
    latitude: lat,
    longitude: lng,
    timestamp: new Date().toISOString()
  };

  state.liveIncidents.push(incident);
  addLiveIncidentToMap(incident);
  updateLiveBadge();
  checkProximity();
  return incident;
}

// Compares live incidents against the user's last known position and
// toasts any that are newly within the alert radius.
function checkProximity() {
  if (!state.userPosition) return;
  state.liveIncidents.forEach((incident) => {
    if (state.alertedIds.has(incident.id)) return;
    const dist = distanceMeters(
      state.userPosition.lat,
      state.userPosition.lng,
      incident.latitude,
      incident.longitude
    );
    if (dist <= state.alertRadiusMeters) {
      state.alertedIds.add(incident.id);
      showLiveToast(incident, dist);
    }
  });
}

function showLiveToast(incident, dist) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const color = SEVERITY_COLOR[incident.severity];

  const toast = document.createElement("div");
  toast.className = "live-toast";
  toast.style.borderLeftColor = color;
  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="mt-0.5 shrink-0" style="width:8px;height:8px;border-radius:999px;background:${color};display:inline-block;"></span>
      <div class="min-w-0">
        <p class="font-display font-semibold text-sm text-[var(--ink)]">Demo: ${incident.type} nearby</p>
        <p class="text-xs text-[var(--ink-soft)] mt-0.5">${incident.blurb} · ~${Math.round(dist)}m away</p>
        <p class="text-[11px] text-[var(--ink-soft)]/70 mt-1">${timeAgoLabel(incident.timestamp)}</p>
      </div>
      <button class="toast-dismiss shrink-0" aria-label="Dismiss">&times;</button>
    </div>
  `;
  toast.querySelector(".toast-dismiss").addEventListener("click", () => dismissToast(toast));
  toast.addEventListener("click", () => {
    map.setView([incident.latitude, incident.longitude], 16);
  });
  container.appendChild(toast);

  setTimeout(() => dismissToast(toast), 9000);
}

function dismissToast(toast) {
  if (!toast.isConnected) return;
  toast.classList.add("live-toast-out");
  setTimeout(() => toast.remove(), 220);
}

function setLiveStatus(text) {
  const el = document.getElementById("live-status-text");
  if (el) el.textContent = text;
}

function handlePositionUpdate(pos) {
  state.userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  state.usingFallbackLocation = false;
  setLiveStatus("Tracking your location");
  updateUserMarker();
  checkProximity();
  if (state.navigating) { checkRouteProximity(); maybeRefreshRoute(); }
}

function handlePositionError() {
  // Fall back to city center so the feature still works without GPS
  // permission — useful for demoing indoors or on desktop.
  if (!state.userPosition) {
    state.userPosition = { lat: CITY_CENTER.lat, lng: CITY_CENTER.lng };
  }
  state.usingFallbackLocation = true;
  setLiveStatus("Location unavailable · using approximate area");
  updateUserMarker();
  if (state.navigating && !state.originOverride) setNavStatus("GPS unavailable. Choose the demo starting point to preview a route.");
}

// Starts the shared GPS watch if it isn't already running. Both live
// alerts and navigation call this — the watch stays alive as long as
// either feature needs it (see stopLocationWatchIfUnused).
function startLocationWatch() {
  if (watchId !== null) return;
  setLiveStatus("Requesting your location…");
  if ("geolocation" in navigator) {
    watchId = navigator.geolocation.watchPosition(handlePositionUpdate, handlePositionError, {
      enableHighAccuracy: true,
      maximumAge: 10000,
      timeout: 8000
    });
  } else {
    handlePositionError();
  }
}

function stopLocationWatchIfUnused() {
  if (state.trackers.alerts || state.trackers.navigation) return;
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  setLiveStatus("Location tracking is off");
}

function startLiveTracking() {
  if (state.liveTracking) return;
  state.liveTracking = true;
  state.trackers.alerts = true;

  document.getElementById("live-toggle").dataset.active = "true";
  document.getElementById("live-toggle").textContent = "Live alerts on";

  startLocationWatch();

  // Simulate incoming reports arriving on their own schedule.
  liveSpawnTimer = setInterval(() => {
    if (document.hidden) return;
    spawnLiveIncident();
  }, 25000 + Math.random() * 15000);
}

function stopLiveTracking() {
  state.liveTracking = false;
  state.trackers.alerts = false;
  document.getElementById("live-toggle").dataset.active = "false";
  document.getElementById("live-toggle").textContent = "Enable live alerts";

  if (liveSpawnTimer) {
    clearInterval(liveSpawnTimer);
    liveSpawnTimer = null;
  }
  stopLocationWatchIfUnused();
}

function bindLiveAlertEvents() {
  document.getElementById("live-toggle").addEventListener("click", () => {
    if (state.liveTracking) {
      stopLiveTracking();
    } else {
      startLiveTracking();
    }
  });

  document.getElementById("live-radius").addEventListener("input", (e) => {
    state.alertRadiusMeters = Number(e.target.value);
    document.getElementById("live-radius-label").textContent = `${state.alertRadiusMeters}m radius`;
  });

  // Manual trigger for demoing/testing without waiting for the timer
  // or needing to physically move near a real report.
  document.getElementById("live-simulate").addEventListener("click", () => {
    if (!state.liveTracking) startLiveTracking();
    spawnLiveIncident();
  });
}

/* ------------------------------ Navigation ------------------------------ */
// Geocoding via OpenStreetMap's Nominatim, routing via the public OSRM
// demo server. Both are free, keyless, and fine for prototyping — swap
// for a paid provider (Mapbox/Google) before any real production traffic.

function setNavStatus(text) {
  const el = document.getElementById("nav-status");
  if (el) el.textContent = text;
}

let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;
const placeSearchCache = new Map();
function normalizePlace(r, query) {
  const lat = Number(r.lat), lng = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat)>90 || Math.abs(lng)>180) return null;
  const a = r.address || {};
  const unique = values => [...new Set(values.filter(Boolean))];
  const title = r.name || a.amenity || a.building || a.road || (r.display_name || '').split(',')[0] || 'Unnamed place';
  // Local neighbourhood and city are more useful than an inherited tehsil name.
  // Keep the provider's full address available for inspection, never invent a PIN.
  const locality = unique([a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village, a.state]).filter(v=>v!==title).join(', ');
  const street = unique([a.house_number, a.road]).join(' ');
  const detail = unique([street!==title ? street : '', locality]).join(' · ');
  const kind = r.addresstype || r.type || '';
  const broad = ['administrative','city','town','village','suburb','neighbourhood','quarter','county','state','postcode','municipality','city_district','district','borough','hamlet'].includes(kind) || r.category==='boundary';
  const postcode = /^\d{6}$/.test(a.postcode || '') ? a.postcode : '';
  const requestedPin = query.match(/\b\d{6}\b/)?.[0];
  const pinMismatch = Boolean(requestedPin && postcode !== requestedPin);
  const precision = broad ? 'Area centre · refine the pin' : ['road','residential','pedestrian','service'].includes(kind) ? 'Street match · check the entrance' : 'Mapped place · check the pin';
  return {lat,lng,title,detail,postcode,broad,pinMismatch,precision,fullAddress:r.display_name || title,
    label: unique([title, street, locality]).join(', ') + (broad ? ' (area centre)' : '') + (pinMismatch ? ' (PIN mismatch)' : ''),
    key:r.osm_type && r.osm_id ? r.osm_type+':'+r.osm_id : lat+','+lng+':'+title};
}
function placeResultButton(place) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'place-result';
  button.title = place.fullAddress;
  [ ['strong',place.title], ['span',place.detail], ['small',place.pinMismatch ? 'PIN does not match your search · verify location' : place.precision],
    ['small',place.postcode ? 'PIN '+place.postcode+' · supplied by OpenStreetMap, unverified' : 'PIN unavailable']
  ].forEach(([tag,text])=>{ if(text){const el=document.createElement(tag);el.textContent=text;button.appendChild(el);} });
  if(place.broad || place.pinMismatch) button.dataset.approximate='true';
  return button;
}
function searchPlaces(query) {
  const scope = document.getElementById('place-search-scope')?.value || 'indore';
  const key = scope+':'+query.trim().toLocaleLowerCase();
  if (placeSearchCache.has(key)) return Promise.resolve(placeSearchCache.get(key));
  const task = geocodeQueue.then(async () => {
  if (placeSearchCache.has(key)) return placeSearchCache.get(key);
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastGeocodeAt))));
  lastGeocodeAt = Date.now();
  const params = new URLSearchParams({format:'jsonv2',limit:'8',countrycodes:'in',addressdetails:'1',dedupe:'1','accept-language':'en',q:query.trim()});
  if(scope==='indore') {params.set('viewbox','75.55,22.95,76.15,22.35');params.set('bounded','1');}
  const url = 'https://nominatim.openstreetmap.org/search?'+params;
  const res = await fetch(url, { headers: { Accept: "application/json" }, signal:AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error("Geocoding failed");
  const results = await res.json();
  if(!Array.isArray(results)) throw new Error('Invalid search response');
  const seen = new Set();
  const places = results.map(r=>normalizePlace(r,query)).filter(r=>r && !seen.has(r.key) && seen.add(r.key));
  // Preserve provider relevance; only demote explicit postcode conflicts.
  places.sort((a,b)=>Number(a.pinMismatch)-Number(b.pinMismatch));
  if(placeSearchCache.size>=60) placeSearchCache.delete(placeSearchCache.keys().next().value);
  placeSearchCache.set(key,places);
  return places;
  });
  geocodeQueue = task.catch(() => {});
  return task;
}
async function geocodeAddress(query) {
  return (await searchPlaces(query))[0] || null;
}

function setPickingDestination(on) {
  state.pickingDestination = on;
  const btn = document.getElementById("nav-pick-map");
  const mapEl = document.getElementById("map");
  btn.dataset.active = String(on);
  btn.textContent = on ? "Click the map to drop a pin…" : "Place or adjust a pin on the map";
  mapEl.style.cursor = on ? "crosshair" : "";
}

function setDestination(lat, lng, label) {
  setPickingDestination(false);
  if (state.navigating) stopNavigation();
  state.destination = { lat, lng, label };
  if (!destinationMarker) {
    destinationMarker = L.marker([lat, lng], { icon: destinationIcon() }).addTo(map);
  } else {
    destinationMarker.setLatLng([lat, lng]);
  }
  document.getElementById("nav-destination-label").textContent = label;
  document.getElementById("nav-destination-summary").classList.remove("hidden");
  document.getElementById("nav-start").disabled = false;
  setNavStatus("Destination set — start navigation when ready");
}

function clearDestination() {
  state.destination = null;
  if (destinationMarker) {
    map.removeLayer(destinationMarker);
    destinationMarker = null;
  }
  document.getElementById("nav-destination-summary").classList.add("hidden");
  document.getElementById("nav-start").disabled = true;
  stopNavigation();
  setNavStatus("Search or drop a pin to set a destination");
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs} hr ${rem} min`;
}

function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

// OSRM maneuver -> short human instruction. Not exhaustive, but covers
// the common cases; falls back to a generic phrase otherwise.
function stepInstruction(step) {
  if (step.instruction) return step.instruction;
  const street = step.name ? ` onto ${step.name}` : "";
  const { type, modifier } = step.maneuver;
  if (type === "depart") return `Head out${street}`;
  if (type === "arrive") return "Arrive at your destination";
  if (type === "roundabout") return `Take the roundabout${street}`;
  if (modifier) {
    const verb = modifier.includes("left") ? "Turn left" : modifier.includes("right") ? "Turn right" : "Continue straight";
    return `${verb}${street}`;
  }
  return `Continue${street}`;
}

function renderSteps(steps) {
  const list = document.getElementById("nav-steps");
  list.innerHTML = "";
  steps.forEach((step) => {
    const li = document.createElement("li");
    li.className = "nav-step";
    li.innerHTML = `
      <span class="nav-step-text">${escapeHtml(stepInstruction(step))}</span>
      <span class="nav-step-dist">${formatDistance(step.distance)}</span>
    `;
    list.appendChild(li);
  });
}

let routeController = null;
async function fetchRoute() {
  const origin = state.originOverride || (!state.usingFallbackLocation && state.userPosition);
  if (!state.navigating || !origin || !state.destination || routeController) return;
  const controller = new AbortController();
  routeController = controller;
  state.lastRouteFetchAt = Date.now();
  const destination = {...state.destination};
  const firstRoute = !state.routeSummary;
  setNavStatus("Calculating driving route…");
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const route = await getDrivingRoute(origin, destination, controller.signal);
    if (!state.navigating || controller.signal.aborted) return;
    const coords = route.geometry.coordinates.map(([lng,lat]) => [lat,lng]);
    routeLine.setLatLngs(coords);
    if (firstRoute) map.fitBounds(routeLine.getBounds(), {padding:[45,45]});
    state.routeSummary = {distanceMeters:route.distance, durationSeconds:route.duration};
    state.routeSteps = route.legs.flatMap(leg => leg.steps);
    state.lastRouteFetchPos = {...origin};
    document.getElementById('nav-eta').textContent = formatDuration(route.duration);
    document.getElementById('nav-distance').textContent = formatDistance(route.distance);
    document.getElementById('nav-summary').classList.remove('hidden');
    renderSteps(state.routeSteps);
    renderRouteWarnings(coords);
    trafficRouteReady(route, coords);
    document.getElementById('route-endpoints').textContent = 'From: ' + (origin.label || 'GPS ' + origin.lat.toFixed(5) + ', ' + origin.lng.toFixed(5)) + ' → To: ' + destination.label;
    setNavStatus((state.originOverride ? 'Route preview' : 'GPS navigation active') + (route.provider === 'TomTom' ? ' · traffic-aware route' : ' · no live traffic') + ' · crime warnings use sample data');
  } catch (error) {
    if (controller.signal.aborted && routeController !== controller) return;
    throw error;
  } finally {
    clearTimeout(timeout);
    if (routeController === controller) routeController = null;
  }
}
function maybeRefreshRoute() {
  if (state.originOverride || state.usingFallbackLocation || routeController) return;
  if (Date.now() - state.lastRouteFetchAt < 120000) return;
  const moved = !state.lastRouteFetchPos || distanceMeters(state.lastRouteFetchPos.lat,state.lastRouteFetchPos.lng,state.userPosition.lat,state.userPosition.lng) >= 40;
  if (state.routeSummary && !moved) return;
  fetchRoute().catch(() => setNavStatus('Route refresh failed. Retrying on a later GPS update.'));
}
function startNavigation() {
  if (!state.destination) return;
  if (document.getElementById('origin-mode').value === 'manual' && !state.originOverride) {
    setNavStatus('Search and select a starting location first.');
    return;
  }
  state.navigating = true;
  state.trackers.navigation = !state.originOverride;
  document.getElementById('nav-start').classList.add('hidden');
  document.getElementById('nav-stop').classList.remove('hidden');
  if (!state.originOverride) startLocationWatch();
  if (state.originOverride || (state.userPosition && !state.usingFallbackLocation)) {
    fetchRoute().catch(() => { stopNavigation(); setNavStatus('Could not calculate route. Check your connection and try again.'); });
  } else setNavStatus('Waiting for GPS. If unavailable, choose the demo starting point.');
}
function stopNavigation() {
  if (typeof clearTrafficRoute === 'function') clearTrafficRoute();
  state.navigating = false;
  state.trackers.navigation = false;
  if (routeController) routeController.abort();
  routeController = null;
  state.routeSummary = null;
  state.lastRouteFetchAt = 0;
  state.routeSteps = [];
  document.getElementById('nav-start').classList.remove('hidden');
  document.getElementById('nav-stop').classList.add('hidden');
  document.getElementById('nav-summary').classList.add('hidden');
  routeLine.setLatLngs([]);
  document.getElementById('nav-steps').innerHTML = '';
  clearRouteWarnings();
  stopLocationWatchIfUnused();
  setNavStatus('Navigation stopped. You can plan another journey.');
}

function bindNavigationEvents() {
  let destinationSearchVersion = 0;
  document.getElementById('nav-search-input').addEventListener('input', () => {
    ++destinationSearchVersion;
    document.getElementById('destination-results').replaceChildren();
    if(state.destination) clearDestination();
  });
  document.getElementById("nav-search-btn").addEventListener("click", async () => {
    const input = document.getElementById("nav-search-input");
    const query = input.value.trim();
    if (!query) return;
    const version = ++destinationSearchVersion;
    const host = document.getElementById('destination-results');
    host.replaceChildren();
    setNavStatus("Searching…");
    try {
      const results = await searchPlaces(query);
      if(version !== destinationSearchVersion) return;
      if (!results.length) {
        setNavStatus("No match in this search area. Add a landmark or choose All India. You can also place a pin.");
        return;
      }
      setNavStatus('Choose a match and check its pin on the map.');
      results.forEach(result => {
        const button = placeResultButton(result);
        button.onclick = () => {
          ++destinationSearchVersion;
          host.replaceChildren();
          setDestination(result.lat, result.lng, result.label);
          map.setView([result.lat, result.lng], 15);
          setNavStatus(result.pinMismatch ? 'PIN differs from your search. Check the location or place a pin manually.' : result.precision+'. Use Place a pin to adjust.');
        };
        host.appendChild(button);
      });
    } catch {
      if(version !== destinationSearchVersion) return;
      setNavStatus("Search failed — check your connection and try again");
    }
  });

  document.getElementById("nav-search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("nav-search-btn").click();
  });

  document.getElementById("nav-pick-map").addEventListener("click", () => {
    ++destinationSearchVersion;
    document.getElementById('destination-results').replaceChildren();
    setPickingDestination(!state.pickingDestination);
  });

  document.getElementById("nav-clear-destination").addEventListener("click", () => {
    ++destinationSearchVersion;
    document.getElementById('destination-results').replaceChildren();
    setPickingDestination(false);
    clearDestination();
  });
  document.getElementById("nav-start").addEventListener("click", startNavigation);
  document.getElementById("nav-stop").addEventListener("click", stopNavigation);
}

/* ------------------------------ Filters UI ------------------------------ */

function populateRegionSelect() {
  const select = document.getElementById("region-select");
  NEIGHBORHOODS.forEach((n) => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    select.appendChild(opt);
  });
}

function renderTypeChips() {
  const wrap = document.getElementById("type-chips");
  wrap.innerHTML = "";
  CRIME_TYPES.forEach((type) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = type;
    btn.className = "chip text-xs font-medium px-3 py-1.5 rounded-full border";
    btn.dataset.active = state.activeTypes.has(type);
    btn.addEventListener("click", () => {
      if (state.activeTypes.has(type)) {
        state.activeTypes.delete(type);
      } else {
        state.activeTypes.add(type);
      }
      btn.dataset.active = state.activeTypes.has(type);
      updateAll();
    });
    wrap.appendChild(btn);
  });
}

function updateLookbackLabel() {
  const el = document.getElementById("lookback-label");
  const fromDate = new Date(TODAY.getTime() - state.lookbackDays * 86400000);
  el.textContent = state.lookbackDays >= 90
    ? `Full range · ${formatDate(fromDate)} – ${formatDate(TODAY)}`
    : `Last ${state.lookbackDays} days · since ${formatDate(fromDate)}`;
}

function bindFilterEvents() {
  document.getElementById("region-select").addEventListener("change", (e) => {
    state.region = e.target.value;
    document.getElementById("map-region-badge").textContent =
      state.region === "all" ? "All Neighborhoods" : state.region;
    updateAll();
  });

  document.getElementById("lookback-range").addEventListener("input", (e) => {
    state.lookbackDays = Number(e.target.value);
    updateLookbackLabel();
    scheduleAnalyticsUpdate();
  });

  document.getElementById("mode-cluster").addEventListener("click", () => setMapMode("cluster"));
  document.getElementById("mode-heat").addEventListener("click", () => setMapMode("heat"));

  document.getElementById("reset-filters").addEventListener("click", () => {
    state.region = "all";
    state.activeTypes = new Set(CRIME_TYPES);
    state.lookbackDays = 90;
    document.getElementById("region-select").value = "all";
    document.getElementById("lookback-range").value = 90;
    document.getElementById("map-region-badge").textContent = "All Neighborhoods";
    updateLookbackLabel();
    renderTypeChips();
    updateAll();
  });

}

function setMapMode(mode) {
  if (!['cluster', 'heat'].includes(mode)) return;
  state.mapMode = mode;
  document.getElementById("mode-cluster").dataset.active = mode === "cluster";
  document.getElementById("mode-heat").dataset.active = mode === "heat";
  document.getElementById('mode-cluster').setAttribute('aria-pressed', String(mode === 'cluster'));
  document.getElementById('mode-heat').setAttribute('aria-pressed', String(mode === 'heat'));
  map.closePopup();
  renderMap(getFilteredData());
}

/* ------------------------------ Orchestration ------------------------------ */

let analyticsFrame = null;
function scheduleAnalyticsUpdate() {
  if (analyticsFrame !== null) return;
  analyticsFrame = requestAnimationFrame(() => { analyticsFrame = null; updateAll(); });
}
function updateAll() {
  const data = getFilteredData();
  renderMap(data);
  renderKPIs(data);
  renderChart(data);
  renderSafety(data, state.region === "all" ? "All Neighborhoods" : state.region);
  window.dashboardAnalysis?.render(data);
  document.getElementById("result-count").textContent =
    `${data.length} incident${data.length === 1 ? "" : "s"} matching current filters`;
}

function init() {
  initMap();
  populateRegionSelect();
  renderTypeChips();
  bindFilterEvents();
  bindLiveAlertEvents();
  bindNavigationEvents();
  updateLookbackLabel();
  updateLiveBadge();
  updateAll();
}

if (typeof location === "undefined" || location.protocol !== "file:") document.addEventListener("DOMContentLoaded", init);
