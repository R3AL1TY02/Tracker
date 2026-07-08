/* ============================================================
   Journey Tracker - Main Application
   ============================================================ */

// ─── Configuration ─────────────────────────────────────────────
const CONFIG = {
  tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
  defaultZoom: 15,
  maxZoom: 19,
  storageKey: 'journey-tracker-journeys',
  settingsKey: 'journey-tracker-settings',
  defaultInterval: 2000,
};

// ─── State ─────────────────────────────────────────────────────
const state = {
  map: null,
  userMarker: null,
  routeLine: null,
  startMarker: null,
  finishMarker: null,
  points: [],
  isTracking: false,
  watchId: null,
  currentPosition: null,
  startTime: null,
  timerInterval: null,
  elapsed: 0,
  photoMarkers: [],
  firstName: localStorage.getItem('jt-firstname') || '',
  lastName: localStorage.getItem('jt-lastname') || '',
};

// ─── Settings ──────────────────────────────────────────────────
const settings = loadSettings();

function loadSettings() {
  try {
    const raw = localStorage.getItem(CONFIG.settingsKey);
    if (raw) return { ...getDefaultSettings(), ...JSON.parse(raw) };
  } catch (_) { /* ignore */ }
  return getDefaultSettings();
}

function getDefaultSettings() {
  return {
    unit: 'km',
    interval: 2000,
    darkMode: true,
    follow: true,
    sheetsUrl: '',
  };
}

function saveSettings() {
  localStorage.setItem(CONFIG.settingsKey, JSON.stringify(settings));
}

// ─── Store ─────────────────────────────────────────────────────
const store = {
  getAll() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || [];
    } catch { return []; }
  },
  save(journeys) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(journeys));
  },
  get(id) {
    return this.getAll().find(j => j.id === id);
  },
  insert(journey) {
    const list = this.getAll();
    list.unshift(journey);
    this.save(list);
    return journey;
  },
  update(id, data) {
    const list = this.getAll();
    const idx = list.findIndex(j => j.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...data };
    this.save(list);
    return list[idx];
  },
  remove(id) {
    const list = this.getAll().filter(j => j.id !== id);
    this.save(list);
  },
  clear() {
    localStorage.removeItem(CONFIG.storageKey);
  },
  search(query) {
    const q = query.toLowerCase();
    return this.getAll().filter(j =>
      (j.name && j.name.toLowerCase().includes(q)) ||
      (j.notes && j.notes.toLowerCase().includes(q))
    );
  },
};

// ─── Utilities ─────────────────────────────────────────────────
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDateTime(ts) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function formatDistance(meters, unit) {
  const u = unit || settings.unit;
  const km = meters / 1000;
  if (u === 'miles') {
    const mi = km * 0.621371;
    return `${mi.toFixed(2)} mi`;
  }
  return `${km.toFixed(2)} km`;
}

function formatSpeed(mps, unit) {
  const u = unit || settings.unit;
  if (u === 'miles') {
    const mph = mps * 2.23694;
    return `${mph.toFixed(1)} mph`;
  }
  const kmh = mps * 3.6;
  return `${kmh.toFixed(1)} km/h`;
}

function haversineDistance(p1, p2) {
  const R = 6371000;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) *
    Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateSpeedBetweenPoints(p1, p2) {
  const dist = haversineDistance(p1, p2);
  const time = (p2.time - p1.time) / 1000;
  if (time <= 0 || dist <= 0) return 0;
  return dist / time;
}

function computeStats(points, startTime, endTime) {
  let totalDistance = 0;
  let maxSpeed = 0;
  for (let i = 1; i < points.length; i++) {
    const d = haversineDistance(points[i - 1], points[i]);
    totalDistance += d;
    const s = calculateSpeedBetweenPoints(points[i - 1], points[i]);
    if (s > maxSpeed) maxSpeed = s;
  }
  const avgSpeed = points.length > 1 && totalDistance > 0
    ? (totalDistance / 1000) / ((endTime - startTime) / 3600000)
    : 0;
  return {
    totalDistance,
    maxSpeed,
    avgSpeed: avgSpeed * (1000 / 3600),
    duration: (endTime - startTime) / 1000,
    pointCount: points.length,
    startTime,
    endTime,
  };
}

function calculateBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
    Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ─── GPX Export / Import ───────────────────────────────────────
function generateGPX(journey) {
  const { points, stats, name, date, notes } = journey;
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="JourneyTracker" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(name || 'Journey')}</name>
    <time>${new Date(date).toISOString()}</time>
    <desc>${escapeXml(notes || '')}</desc>
  </metadata>
  <trk>
    <name>${escapeXml(name || 'Journey')}</name>
    <trkseg>\n`;
  for (const p of points) {
    gpx += `      <trkpt lat="${p.lat}" lon="${p.lng}">`;
    if (p.alt !== undefined && p.alt !== null) gpx += `\n        <ele>${p.alt}</ele>`;
    if (p.time) gpx += `\n        <time>${new Date(p.time).toISOString()}</time>`;
    gpx += `\n      </trkpt>\n`;
  }
  gpx += `    </trkseg>
  </trk>
</gpx>`;
  return gpx;
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function downloadGPX(gpx, filename) {
  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function parseGPX(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');
  const trkpts = doc.querySelectorAll('trkpt');
  const points = [];
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    const eleEl = pt.querySelector('ele');
    const timeEl = pt.querySelector('time');
    points.push({
      lat,
      lng,
      alt: eleEl ? parseFloat(eleEl.textContent) : null,
      time: timeEl ? new Date(timeEl.textContent).getTime() : Date.now(),
      speed: 0,
      accuracy: null,
      heading: null,
    });
  });
  const nameEl = doc.querySelector('metadata > name, trk > name');
  const name = nameEl ? nameEl.textContent : 'Imported Journey';
  return { name, points };
}

// ─── Map Manager ───────────────────────────────────────────────
function initMap() {
  state.map = L.map('map', {
    zoomControl: false,
    attributionControl: false,
    zoom: CONFIG.defaultZoom,
    center: [51.505, -0.09],
  });

  L.control.zoom({ position: 'bottomright' }).addTo(state.map);

  L.tileLayer(CONFIG.tileUrl, {
    maxZoom: CONFIG.maxZoom,
    attribution: CONFIG.tileAttribution,
  }).addTo(state.map);

  state.map.on('locationfound', onLocationFound);
  state.map.on('locationerror', () => {
    state.map.setView([51.505, -0.09], CONFIG.defaultZoom);
  });

  setTimeout(() => locateMap(), 500);
}

function locateMap() {
  state.map.locate({ setView: true, maxZoom: CONFIG.defaultZoom, enableHighAccuracy: true });
}

function updateUserMarker(latlng, heading) {
  const icon = L.divIcon({
    className: 'user-location-marker',
    html: `<div style="
      width:24px;height:24px;border-radius:50%;
      background:var(--accent,#007aff);
      border:3px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      transition:transform 0.15s;
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

  if (state.userMarker) {
    state.userMarker.setLatLng(latlng);
    if (heading !== null && heading !== undefined) {
      const el = state.userMarker.getElement();
      if (el) {
        const dot = el.querySelector('div');
        if (dot) dot.style.transform = `rotate(${heading}deg)`;
      }
    }
  } else {
    state.userMarker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(state.map);
  }
}

function onLocationFound(e) {
  state.currentPosition = e;
  updateUserMarker(e.latlng, e.heading);
  updateAccuracy(e);
  hideAccuracy();
}

function updateAccuracy(e) {
  const el = document.getElementById('gps-accuracy');
  const dot = document.getElementById('accuracy-dot');
  const text = document.getElementById('accuracy-text');
  el.style.display = 'flex';
  const acc = e.accuracy;
  if (acc < 10) { dot.className = 'accuracy-dot high'; text.textContent = `GPS: ${acc}m`; }
  else if (acc < 50) { dot.className = 'accuracy-dot medium'; text.textContent = `GPS: ${acc}m`; }
  else { dot.className = 'accuracy-dot low'; text.textContent = `GPS: ${acc}m`; }
}

function hideAccuracy() {
  setTimeout(() => {
    document.getElementById('gps-accuracy').style.display = 'none';
  }, 4000);
}

// ─── Map route helpers ─────────────────────────────────────────
function drawRoute(points, map) {
  const m = map || state.map;
  if (!m) return;
  const latlngs = points.map(p => [p.lat, p.lng]);
  if (state.routeLine) {
    state.routeLine.setLatLngs(latlngs);
  } else {
    state.routeLine = L.polyline(latlngs, {
      color: '#007aff',
      weight: 4,
      opacity: 0.8,
      smoothFactor: 1,
    }).addTo(m);
  }
}

function addStartMarker(point, map) {
  const m = map || state.map;
  if (!m) return;
  const icon = L.divIcon({
    className: 'start-marker',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#34c759;
      border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  if (state.startMarker) state.startMarker.setLatLng([point.lat, point.lng]);
  else state.startMarker = L.marker([point.lat, point.lng], { icon }).addTo(m);
}

function addFinishMarker(point, map) {
  const m = map || state.map;
  if (!m) return;
  const icon = L.divIcon({
    className: 'finish-marker',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:#ff3b30;
      border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
  if (state.finishMarker) state.finishMarker.setLatLng([point.lat, point.lng]);
  else state.finishMarker = L.marker([point.lat, point.lng], { icon }).addTo(m);
}

function fitRoute(points, map) {
  const m = map || state.map;
  if (!m || !points.length) return;
  const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
  m.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
}

function clearRoute() {
  if (state.startMarker) { state.map.removeLayer(state.startMarker); state.startMarker = null; }
  if (state.finishMarker) { state.map.removeLayer(state.finishMarker); state.finishMarker = null; }
  if (state.routeLine) { state.map.removeLayer(state.routeLine); state.routeLine = null; }
}

// ─── Photo markers on map ──────────────────────────────────────
function addPhotoMarker(photo, map) {
  const m = map || state.map;
  if (!m) return null;
  const icon = L.divIcon({
    className: 'photo-marker',
    html: `<div style="
      width:36px;height:36px;border-radius:8px;
      background-size:cover;background-position:center;
      border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
      cursor:pointer;
      background-image:url(${photo.dataUrl});
    "></div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
  const marker = L.marker([photo.lat, photo.lng], { icon }).addTo(m);
  marker.bindPopup(`<img src="${photo.dataUrl}" style="max-width:200px;border-radius:8px;display:block">`);
  return marker;
}

// ─── Tracker ───────────────────────────────────────────────────
function startTracking() {
  if (state.isTracking) return;
  if (!state.firstName || !state.lastName) {
    showNamePrompt();
    return;
  }
  beginTracking();
}

function showNamePrompt() {
  document.getElementById('name-first').value = state.firstName;
  document.getElementById('name-last').value = state.lastName;
  document.getElementById('name-overlay').classList.add('open');
}

function confirmName() {
  const first = document.getElementById('name-first').value.trim();
  const last = document.getElementById('name-last').value.trim();
  if (!first || !last) {
    alert('Please enter both first and last name.');
    return;
  }
  state.firstName = first;
  state.lastName = last;
  localStorage.setItem('jt-firstname', first);
  localStorage.setItem('jt-lastname', last);
  document.getElementById('name-overlay').classList.remove('open');
  beginTracking();
}

function beginTracking() {
  state.isTracking = true;
  state.points = [];
  state.startTime = Date.now();
  state.elapsed = 0;
  state.photoMarkers.forEach(m => state.map.removeLayer(m));
  state.photoMarkers = [];
  clearRoute();

  document.getElementById('track-btn').className = 'tracking-btn stop';
  document.getElementById('track-btn').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px">
      <rect x="6" y="6" width="12" height="12" rx="2"/>
    </svg>
    Stop Tracking`;
  document.getElementById('live-stats').style.display = 'flex';

  const interval = settings.interval || CONFIG.defaultInterval;
  state.watchId = navigator.geolocation.watchPosition(
    onPosition,
    err => console.warn('GPS error:', err.message),
    { enableHighAccuracy: true, timeout: interval + 2000, maximumAge: 0 }
  );

  state.timerInterval = setInterval(() => {
    state.elapsed = (Date.now() - state.startTime) / 1000;
    updateLiveStats();
  }, 1000);

  if (settings.follow) {
    state.map.on('locationfound', onFollowLocation);
  }
}

function onPosition(pos) {
  const point = {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    alt: pos.coords.altitude,
    speed: pos.coords.speed || 0,
    accuracy: pos.coords.accuracy,
    heading: pos.coords.heading,
    time: pos.timestamp,
  };
  state.points.push(point);
  state.currentPosition = pos;

  drawRoute(state.points);
  addStartMarker(state.points[0]);

  if (state.points.length > 1) {
    addFinishMarker(state.points[state.points.length - 1]);
  }

  updateUserMarker([point.lat, point.lng], point.heading);
  updateLiveStats();

  if (settings.follow) {
    state.map.setView([point.lat, point.lng], state.map.getZoom());
  }
}

function onFollowLocation(e) {
  if (state.isTracking && settings.follow) {
    state.map.setView(e.latlng, state.map.getZoom());
  }
}

function updateLiveStats() {
  const dist = state.points.length > 1
    ? state.points.slice(1).reduce((sum, p, i) =>
        sum + haversineDistance(state.points[i], p), 0)
    : 0;
  document.getElementById('live-distance').textContent = formatDistance(dist).split(' ')[0];
  document.getElementById('live-time').textContent = formatTime(state.elapsed);
  let speed = 0;
  if (state.points.length >= 2) {
    const p1 = state.points[state.points.length - 2];
    const p2 = state.points[state.points.length - 1];
    speed = calculateSpeedBetweenPoints(p1, p2);
  }
  document.getElementById('live-speed').textContent = formatSpeed(speed).split(' ')[0];
}

function stopTracking() {
  if (!state.isTracking) return;
  state.isTracking = false;

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
  clearInterval(state.timerInterval);

  state.map.off('locationfound', onFollowLocation);

  document.getElementById('track-btn').className = 'tracking-btn start';
  document.getElementById('track-btn').innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px">
      <path d="M8 5v14l11-7z"/>
    </svg>
    Start Tracking`;

  if (state.points.length < 2) {
    document.getElementById('live-stats').style.display = 'none';
    return;
  }

  fitRoute(state.points);
  showSummary();
}

// ─── Journey Summary ───────────────────────────────────────────
function showSummary() {
  const statRow = document.getElementById('summary-stats');
  const stats = computeStats(state.points, state.startTime, Date.now());
  const endTime = Date.now();

  state.pendingStats = stats;

  statRow.innerHTML = `
    <div class="stat-item"><div class="stat-value">${formatDistance(stats.totalDistance)}</div><div class="stat-label">Distance</div></div>
    <div class="stat-item"><div class="stat-value">${formatTime(stats.duration)}</div><div class="stat-label">Duration</div></div>
    <div class="stat-item"><div class="stat-value">${formatSpeed(stats.avgSpeed)}</div><div class="stat-label">Avg Speed</div></div>
    <div class="stat-item"><div class="stat-value">${formatSpeed(stats.maxSpeed)}</div><div class="stat-label">Max Speed</div></div>
    <div class="stat-item"><div class="stat-value">${stats.pointCount}</div><div class="stat-label">Points</div></div>
    <div class="stat-item"><div class="stat-value">${formatDate(stats.startTime)}</div><div class="stat-label">Start</div></div>
  `;

  document.getElementById('summary-name').value = `Journey ${formatDate(stats.startTime)}`;
  document.getElementById('summary-notes').value = '';
  document.getElementById('summary-overlay').classList.add('open');
}

function saveJourney() {
  const name = document.getElementById('summary-name').value.trim() || 'My Journey';
  const notes = document.getElementById('summary-notes').value.trim();
  const stats = state.pendingStats;
  if (!stats) return;

  const journey = {
    id: generateId(),
    name,
    notes,
    date: Date.now(),
    favourite: false,
    firstName: state.firstName,
    lastName: state.lastName,
    points: state.points,
    stats: {
      totalDistance: stats.totalDistance,
      duration: stats.duration,
      avgSpeed: stats.avgSpeed,
      maxSpeed: stats.maxSpeed,
      pointCount: stats.pointCount,
      startTime: stats.startTime,
      endTime: stats.endTime,
    },
    startLocation: state.points.length > 0
      ? { lat: state.points[0].lat, lng: state.points[0].lng }
      : null,
    finishLocation: state.points.length > 1
      ? { lat: state.points[state.points.length - 1].lat, lng: state.points[state.points.length - 1].lng }
      : null,
    photos: state.pendingPhotos || [],
  };

  store.insert(journey);
  closeSummary();
  document.getElementById('live-stats').style.display = 'none';
  state.points = [];
  state.pendingPhotos = [];
  renderHistory();
  renderStats();
  updateSummarySheetBtn();
}

function closeSummary() {
  document.getElementById('summary-overlay').classList.remove('open');
  state.pendingStats = null;
}

// ─── Render History ────────────────────────────────────────────
function renderHistory(query) {
  const list = document.getElementById('history-list');
  const journeys = query ? store.search(query) : store.getAll();

  if (!journeys.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/></svg>
        <h3>No journeys yet</h3>
        <p>Start tracking your first journey on the Map tab.</p>
      </div>`;
    return;
  }

  list.innerHTML = journeys.map(j => {
    const d = j.stats;
    return `
      <div class="journey-card" data-id="${j.id}">
        <button class="journey-card-fav${j.favourite ? ' fav' : ''}" data-fav="${j.id}" aria-label="Favourite">★</button>
        <div class="journey-card-header">
          <div>
            <div class="journey-card-name">${escapeXml(j.name)}</div>
            <div class="journey-card-date">${formatDate(j.date)}</div>
          </div>
        </div>
        <div class="journey-card-stats">
          <span>${formatDistance(d.totalDistance)}</span>
          <span>${formatTime(d.duration)}</span>
          <span>${formatSpeed(d.avgSpeed)}</span>
        </div>
        <div class="journey-card-actions">
          <button class="btn btn-ghost share-journey-btn" data-id="${j.id}" style="padding:6px 12px;font-size:12px">Share</button>
          <button class="btn btn-ghost export-journey-btn" data-id="${j.id}" style="padding:6px 12px;font-size:12px">GPX</button>
          <button class="btn btn-ghost-danger delete-journey-btn" data-id="${j.id}" style="padding:6px 12px;font-size:12px">Delete</button>
        </div>
      </div>`;
  }).join('');
}

// ─── Render Stats Dashboard ────────────────────────────────────
function renderStats() {
  const el = document.getElementById('stats-content');
  const journeys = store.getAll();
  const totalDistance = journeys.reduce((s, j) => s + (j.stats.totalDistance || 0), 0);
  const totalTime = journeys.reduce((s, j) => s + (j.stats.duration || 0), 0);
  const longest = journeys.reduce((best, j) => (j.stats.totalDistance || 0) > (best?.stats?.totalDistance || 0) ? j : best, null);
  const fastest = journeys.reduce((best, j) => (j.stats.maxSpeed || 0) > (best?.stats?.maxSpeed || 0) ? j : best, null);

  el.innerHTML = `
    <div class="stats-hero">
      <div class="stats-hero-value">${formatDistance(totalDistance)}</div>
      <div class="stats-hero-label">Total Distance</div>
    </div>
    <div class="card">
      <div class="card-title">Overview</div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value">${journeys.length}</div><div class="stat-label">Journeys</div></div>
        <div class="stat-item"><div class="stat-value">${formatTime(totalTime)}</div><div class="stat-label">Time Travelled</div></div>
        <div class="stat-item"><div class="stat-value">${journeys.length ? formatDistance(totalDistance / journeys.length) : '0'}</div><div class="stat-label">Avg / Journey</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Records</div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value">${longest ? formatDistance(longest.stats.totalDistance) : '0'}</div><div class="stat-label">Longest</div></div>
        <div class="stat-item"><div class="stat-value">${fastest ? formatSpeed(fastest.stats.maxSpeed) : '0'}</div><div class="stat-label">Fastest</div></div>
        <div class="stat-item"><div class="stat-value">${longest ? formatTime(longest.stats.duration) : '0'}</div><div class="stat-label">Longest Time</div></div>
      </div>
    </div>
    ${journeys.length === 0 ? `
      <div class="empty-state">
        <h3>No data yet</h3>
        <p>Complete a journey to see statistics.</p>
      </div>` : ''}
  `;
}

// ─── Render Detail View ────────────────────────────────────────
function openDetail(journeyId) {
  const journey = store.get(journeyId);
  if (!journey) return;
  state.detailJourney = journey;

  document.getElementById('detail-view').classList.add('open');
  document.getElementById('detail-title').textContent = journey.name;

  const dv = document.getElementById('detail-view');
  requestAnimationFrame(() => {
    const mapEl = document.getElementById('detail-map');
    if (mapEl._leaflet_map) {
      mapEl._leaflet_map.remove();
    }
    const map = L.map(mapEl, {
      zoomControl: false,
      attributionControl: false,
    });
    mapEl._leaflet_map = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(CONFIG.tileUrl, { maxZoom: CONFIG.maxZoom }).addTo(map);

    if (journey.points && journey.points.length > 1) {
      const latlngs = journey.points.map(p => [p.lat, p.lng]);
      L.polyline(latlngs, { color: '#007aff', weight: 4, opacity: 0.8 }).addTo(map);
      const startIcon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#34c759;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      const endIcon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:#ff3b30;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>`,
        iconSize: [12, 12], iconAnchor: [6, 6],
      });
      L.marker(journey.points[0], { icon: startIcon }).addTo(map);
      L.marker(journey.points[journey.points.length - 1], { icon: endIcon }).addTo(map);
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    } else {
      map.setView([51.505, -0.09], 13);
    }

    setTimeout(() => map.invalidateSize(), 300);
  });

  const d = journey.stats;
  const content = document.getElementById('detail-content');
  content.innerHTML = `
    <div class="card">
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value">${formatDistance(d.totalDistance)}</div><div class="stat-label">Distance</div></div>
        <div class="stat-item"><div class="stat-value">${formatTime(d.duration)}</div><div class="stat-label">Duration</div></div>
        <div class="stat-item"><div class="stat-value">${formatSpeed(d.avgSpeed)}</div><div class="stat-label">Avg Speed</div></div>
        <div class="stat-item"><div class="stat-value">${formatSpeed(d.maxSpeed)}</div><div class="stat-label">Max Speed</div></div>
        <div class="stat-item"><div class="stat-value">${d.pointCount}</div><div class="stat-label">Points</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Times</div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value" style="font-size:14px">${formatDateTime(d.startTime)}</div><div class="stat-label">Start</div></div>
        <div class="stat-item"><div class="stat-value" style="font-size:14px">${formatDateTime(d.endTime)}</div><div class="stat-label">End</div></div>
      </div>
    </div>
    ${journey.notes ? `
    <div class="card">
      <div class="card-title">Notes</div>
      <p style="font-size:15px;color:var(--text-secondary);line-height:1.5">${escapeXml(journey.notes)}</p>
    </div>` : ''}
    ${journey.startLocation ? `
    <div class="card">
      <div class="card-title">Locations</div>
      <div class="stat-row">
        <div class="stat-item"><div class="stat-value" style="font-size:13px">${journey.startLocation.lat.toFixed(4)}, ${journey.startLocation.lng.toFixed(4)}</div><div class="stat-label">Start</div></div>
        <div class="stat-item"><div class="stat-value" style="font-size:13px">${journey.finishLocation.lat.toFixed(4)}, ${journey.finishLocation.lng.toFixed(4)}</div><div class="stat-label">Finish</div></div>
      </div>
    </div>` : ''}
    ${journey.photos && journey.photos.length ? `
    <div class="card">
      <div class="card-title">Photos (${journey.photos.length})</div>
      <div class="photo-grid">
        ${journey.photos.map(p => `<img class="photo-thumb" src="${p.dataUrl}" alt="Photo">`).join('')}
      </div>
    </div>` : ''}
  `;

  updateFavBtn(journey.favourite);
}

function updateFavBtn(fav) {
  const btn = document.getElementById('detail-fav-btn');
  btn.style.color = fav ? 'var(--warning)' : 'var(--text-tertiary)';
  btn.dataset.fav = fav ? 'true' : 'false';
}

function closeDetail() {
  document.getElementById('detail-view').classList.remove('open');
  const mapEl = document.getElementById('detail-map');
  if (mapEl._leaflet_map) {
    mapEl._leaflet_map.remove();
    mapEl._leaflet_map = null;
  }
}

// ─── UI Setup ──────────────────────────────────────────────────
function applyTheme() {
  document.documentElement.setAttribute('data-theme', settings.darkMode ? 'dark' : 'light');
  document.querySelector('meta[name="theme-color"]').setAttribute('content',
    settings.darkMode ? '#0a0a0f' : '#f2f2f7');
  const toggle = document.getElementById('dark-mode-toggle');
  toggle.classList.toggle('on', settings.darkMode);
}

function setupUI() {
  // Theme
  applyTheme();
  document.getElementById('dark-mode-toggle').addEventListener('click', () => {
    settings.darkMode = !settings.darkMode;
    saveSettings();
    applyTheme();
  });

  // Follow toggle
  const followToggle = document.getElementById('follow-toggle');
  followToggle.classList.toggle('on', settings.follow);
  followToggle.addEventListener('click', () => {
    settings.follow = !settings.follow;
    saveSettings();
    followToggle.classList.toggle('on', settings.follow);
  });

  // Unit
  const unitSelect = document.getElementById('setting-unit');
  unitSelect.value = settings.unit;
  unitSelect.addEventListener('change', () => {
    settings.unit = unitSelect.value;
    saveSettings();
  });

  // Sheets URL
  const sheetsInput = document.getElementById('setting-sheets-url');
  sheetsInput.value = settings.sheetsUrl;
  sheetsInput.addEventListener('change', () => {
    settings.sheetsUrl = sheetsInput.value.trim();
    saveSettings();
  });

  // Interval
  const intervalSelect = document.getElementById('setting-interval');
  intervalSelect.value = String(settings.interval);
  intervalSelect.addEventListener('change', () => {
    settings.interval = parseInt(intervalSelect.value, 10);
    saveSettings();
  });

  // Tab navigation
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Track button
  document.getElementById('track-btn').addEventListener('click', () => {
    if (state.isTracking) stopTracking();
    else startTracking();
  });

  // Locate button
  document.getElementById('locate-btn').addEventListener('click', locateMap);
  document.getElementById('photo-btn').addEventListener('click', capturePhoto);

  // Name prompt
  document.getElementById('name-confirm-btn').addEventListener('click', confirmName);
  document.getElementById('name-cancel-btn').addEventListener('click', () => {
    document.getElementById('name-overlay').classList.remove('open');
  });
  document.getElementById('name-first').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('name-last').focus();
  });
  document.getElementById('name-last').addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmName();
  });

  // Summary
  document.getElementById('summary-save-btn').addEventListener('click', saveJourney);
  document.getElementById('summary-discard-btn').addEventListener('click', () => {
    closeSummary();
    document.getElementById('live-stats').style.display = 'none';
    state.points = [];
  });
  document.getElementById('summary-sheet-btn').addEventListener('click', () => exportToSheets(null));

  // History search
  const searchInput = document.getElementById('history-search-input');
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => renderHistory(searchInput.value.trim()), 250);
  });

  // History list delegation
  document.getElementById('history-list').addEventListener('click', e => {
    const card = e.target.closest('.journey-card');
    const favBtn = e.target.closest('.journey-card-fav');
    const shareBtn = e.target.closest('.share-journey-btn');
    const exportBtn = e.target.closest('.export-journey-btn');
    const deleteBtn = e.target.closest('.delete-journey-btn');

    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.fav;
      const j = store.get(id);
      if (j) {
        store.update(id, { favourite: !j.favourite });
        renderHistory(searchInput.value.trim());
      }
      return;
    }
    if (shareBtn) { e.stopPropagation(); shareJourney(shareBtn.dataset.id); return; }
    if (exportBtn) { e.stopPropagation(); exportJourney(exportBtn.dataset.id); return; }
    if (deleteBtn) { e.stopPropagation(); deleteJourney(deleteBtn.dataset.id); return; }
    if (card) openDetail(card.dataset.id);
  });

  // Detail buttons
  document.getElementById('detail-back-btn').addEventListener('click', closeDetail);
  document.getElementById('detail-fav-btn').addEventListener('click', () => {
    const j = state.detailJourney;
    if (!j) return;
    const updated = store.update(j.id, { favourite: !j.favourite });
    if (updated) {
      state.detailJourney = updated;
      updateFavBtn(updated.favourite);
      renderHistory(document.getElementById('history-search-input').value.trim());
    }
  });
  document.getElementById('detail-share-btn').addEventListener('click', () => {
    shareJourney(state.detailJourney?.id);
  });
  document.getElementById('detail-export-btn').addEventListener('click', () => {
    exportJourney(state.detailJourney?.id);
  });
  document.getElementById('detail-sheet-btn').addEventListener('click', () => {
    exportToSheets(state.detailJourney?.id);
  });
  document.getElementById('detail-delete-btn').addEventListener('click', () => {
    const j = state.detailJourney;
    if (!j) return;
    if (confirm(`Delete "${j.name}"?`)) {
      store.remove(j.id);
      closeDetail();
      renderHistory(document.getElementById('history-search-input').value.trim());
      renderStats();
    }
  });

  // Settings actions
  document.getElementById('export-all-btn').addEventListener('click', exportAllGPX);
  document.getElementById('import-gpx-btn').addEventListener('click', () => {
    document.getElementById('gpx-file-input').click();
  });
  document.getElementById('gpx-file-input').addEventListener('change', importGPX);
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (confirm('Delete all journeys? This cannot be undone.')) {
      store.clear();
      renderHistory();
      renderStats();
    }
  });

  // Photo input
  document.getElementById('photo-input').addEventListener('change', onPhotoCaptured);
}

function switchTab(tab) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(`${tab}-view`).classList.add('active');
  document.querySelector(`.tab-item[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'history') renderHistory(document.getElementById('history-search-input').value.trim());
  if (tab === 'stats') renderStats();
  if (tab === 'map') {
    setTimeout(() => {
      if (state.map) state.map.invalidateSize();
    }, 300);
  }
}

// ─── Share & Export ────────────────────────────────────────────
async function shareJourney(id) {
  const j = store.get(id);
  if (!j) return;
  const d = j.stats;
  const text = `📍 ${j.name}\n` +
    `📏 ${formatDistance(d.totalDistance)} in ${formatTime(d.duration)}\n` +
    `⚡ Avg: ${formatSpeed(d.avgSpeed)} | Max: ${formatSpeed(d.maxSpeed)}\n` +
    `📍 ${formatDate(d.startTime)}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: j.name, text });
    } catch (_) { /* user cancelled */ }
  } else {
    await navigator.clipboard.writeText(text);
    alert('Journey details copied to clipboard!');
  }
}

function exportJourney(id) {
  const j = store.get(id);
  if (!j) return;
  const gpx = generateGPX(j);
  const name = j.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'journey';
  downloadGPX(gpx, `${name}.gpx`);
}

function exportAllGPX() {
  const journeys = store.getAll();
  if (!journeys.length) { alert('No journeys to export.'); return; }
  let combined = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="JourneyTracker" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  for (const j of journeys) {
    combined += `  <trk>\n    <name>${escapeXml(j.name)}</name>\n    <trkseg>\n`;
    for (const p of j.points) {
      combined += `      <trkpt lat="${p.lat}" lon="${p.lng}">`;
      if (p.time) combined += `\n        <time>${new Date(p.time).toISOString()}</time>`;
      combined += `\n      </trkpt>\n`;
    }
    combined += `    </trkseg>\n  </trk>\n`;
  }
  combined += `</gpx>`;
  downloadGPX(combined, `all_journeys.gpx`);
}

function importGPX(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const { name, points } = parseGPX(evt.target.result);
      if (points.length < 2) { alert('GPX file must contain at least 2 track points.'); return; }
      const startTime = points[0].time || Date.now();
      const endTime = points[points.length - 1].time || Date.now();
      const stats = computeStats(points, startTime, endTime);
      const journey = {
        id: generateId(),
        name,
        notes: '',
        date: Date.now(),
        favourite: false,
        points,
        stats: {
          totalDistance: stats.totalDistance,
          duration: stats.duration,
          avgSpeed: stats.avgSpeed,
          maxSpeed: stats.maxSpeed,
          pointCount: stats.pointCount,
          startTime: stats.startTime,
          endTime: stats.endTime,
        },
        startLocation: { lat: points[0].lat, lng: points[0].lng },
        finishLocation: { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng },
        photos: [],
      };
      store.insert(journey);
      renderHistory(document.getElementById('history-search-input').value.trim());
      renderStats();
      alert(`Imported "${name}" with ${points.length} points.`);
    } catch (err) {
      alert('Failed to parse GPX file: ' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─── Google Sheets Export ──────────────────────────────────────
function updateSummarySheetBtn() {
  const btn = document.getElementById('summary-sheet-btn');
  if (!btn) return;
  const j = store.getAll()[0];
  if (!j) { btn.style.display = 'none'; return; }
  btn.style.display = j.sheetExported ? 'none' : 'inline-flex';
}

async function exportToSheets(journeyId) {
  const j = journeyId ? store.get(journeyId) : store.getAll()[0];
  if (!j) { alert('No journey to export.'); return; }
  if (!settings.sheetsUrl) {
    alert('Please set your Google Sheets Web App URL in Settings first.');
    switchTab('settings');
    return;
  }
  if (j.sheetExported) {
    alert('Already exported to Google Sheets.');
    return;
  }

  const btn = document.getElementById('summary-sheet-btn') || document.getElementById('detail-sheet-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }

  try {
    const payload = {
      firstName: j.firstName || '',
      lastName: j.lastName || '',
      date: new Date(j.date).toISOString().split('T')[0],
      name: j.name,
      distance: formatDistance(j.stats.totalDistance, 'km'),
      distanceMeters: j.stats.totalDistance.toFixed(1),
      duration: formatTime(j.stats.duration),
      durationSeconds: j.stats.duration.toFixed(0),
      avgSpeed: formatSpeed(j.stats.avgSpeed, 'km'),
      maxSpeed: formatSpeed(j.stats.maxSpeed, 'km'),
      avgSpeedMs: j.stats.avgSpeed.toFixed(2),
      maxSpeedMs: j.stats.maxSpeed.toFixed(2),
      points: j.stats.pointCount,
      startTime: new Date(j.stats.startTime).toISOString(),
      endTime: new Date(j.stats.endTime).toISOString(),
      startLat: j.startLocation ? j.startLocation.lat.toFixed(6) : '',
      startLng: j.startLocation ? j.startLocation.lng.toFixed(6) : '',
      finishLat: j.finishLocation ? j.finishLocation.lat.toFixed(6) : '',
      finishLng: j.finishLocation ? j.finishLocation.lng.toFixed(6) : '',
      notes: j.notes || '',
    };

    const resp = await fetch(settings.sheetsUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    store.update(j.id, { sheetExported: true });
    if (btn) { btn.textContent = 'Exported ✅'; btn.style.opacity = '0.5'; }
    alert('Journey exported to Google Sheets!');
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Export to Sheets'; }
    alert('Export failed: ' + err.message + '\nMake sure your Google Sheets Web App URL is correct in Settings.');
  }
  updateSummarySheetBtn();
}

// ─── Photo capture ─────────────────────────────────────────────
function capturePhoto() {
  if (!state.isTracking) { alert('Start tracking first to add photos.'); return; }
  document.getElementById('photo-input').click();
}

function onPhotoCaptured(e) {
  const file = e.target.files[0];
  if (!file || !state.isTracking) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const pos = state.currentPosition;
    const photo = {
      dataUrl: evt.target.result,
      lat: pos ? pos.latlng.lat : 0,
      lng: pos ? pos.latlng.lng : 0,
      time: Date.now(),
    };
    const marker = addPhotoMarker(photo);
    if (marker) state.photoMarkers.push(marker);
    state.pendingPhoto = photo;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

// ─── Service Worker Registration ───────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js')
      .then(() => console.log('SW registered'))
      .catch(err => console.warn('SW registration failed:', err));
  }
}

// ─── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  initMap();
  renderHistory();
  renderStats();
  registerSW();
});
