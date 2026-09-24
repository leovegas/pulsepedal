'use strict';

// ---------- Profile (stored locally on this device only) ----------

const PROFILE_KEY = 'ridestats.profile';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || null;
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

let profile = loadProfile();

const settingsDialog = document.getElementById('settingsDialog');
const settingsForm = document.getElementById('settingsForm');
const weightInput = document.getElementById('weightInput');
const ageInput = document.getElementById('ageInput');
const sexInput = document.getElementById('sexInput');
const hrAlertEnabledInput = document.getElementById('hrAlertEnabledInput');
const hrMinInput = document.getElementById('hrMinInput');
const hrMaxInput = document.getElementById('hrMaxInput');
const hrAlertRangeEl = document.getElementById('hrAlertRange');
const testAlertBtn = document.getElementById('testAlertBtn');

const DEFAULT_HR_MIN = 110;
const DEFAULT_HR_MAX = 165;

function updateAlertFieldsState() {
  const enabled = hrAlertEnabledInput.checked;
  hrMinInput.disabled = !enabled;
  hrMaxInput.disabled = !enabled;
  hrAlertRangeEl.classList.toggle('disabled', !enabled);
}

function openSettings() {
  if (profile) {
    weightInput.value = profile.weight;
    ageInput.value = profile.age;
    sexInput.value = profile.sex;
    hrAlertEnabledInput.checked = !!profile.hrAlertsEnabled;
    hrMinInput.value = profile.hrMin != null ? profile.hrMin : DEFAULT_HR_MIN;
    hrMaxInput.value = profile.hrMax != null ? profile.hrMax : DEFAULT_HR_MAX;
  } else {
    hrAlertEnabledInput.checked = false;
    hrMinInput.value = DEFAULT_HR_MIN;
    hrMaxInput.value = DEFAULT_HR_MAX;
  }
  updateAlertFieldsState();
  settingsDialog.showModal();
}

document.getElementById('settingsBtn').addEventListener('click', openSettings);
hrAlertEnabledInput.addEventListener('change', updateAlertFieldsState);
testAlertBtn.addEventListener('click', () => {
  unlockAudio();
  playAlertSound('low');
  setTimeout(() => playAlertSound('high'), 500);
});

settingsForm.addEventListener('submit', () => {
  profile = {
    weight: parseFloat(weightInput.value),
    age: parseInt(ageInput.value, 10),
    sex: sexInput.value,
    hrAlertsEnabled: hrAlertEnabledInput.checked,
    hrMin: parseInt(hrMinInput.value, 10),
    hrMax: parseInt(hrMaxInput.value, 10),
  };
  saveProfile(profile);
  lastAlertKind = null;
});

if (!profile) openSettings();

// ---------- DOM ----------

const hrValueEl = document.getElementById('hrValue');
const hrTileEl = document.getElementById('hrTile');
const hrZoneEl = document.getElementById('hrZone');
const speedValueEl = document.getElementById('speedValue');
const distValueEl = document.getElementById('distValue');
const straightDistValueEl = document.getElementById('straightDistValue');
const elevGainTileEl = document.getElementById('elevGainTile');
const elevGainValueEl = document.getElementById('elevGainValue');
const calValueEl = document.getElementById('calValue');
const timeValueEl = document.getElementById('timeValue');
const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');
const hrChartEl = document.getElementById('hrChart');
const speedChartEl = document.getElementById('speedChart');
const hrRangeEl = document.getElementById('hrRange');
const speedRangeEl = document.getElementById('speedRange');
const liveZoneBarEl = document.getElementById('liveZoneBar');
const liveZoneLegendEl = document.getElementById('liveZoneLegend');

const historyBtn = document.getElementById('historyBtn');
const summaryDialog = document.getElementById('summaryDialog');
const summaryTitleEl = document.getElementById('summaryTitle');
const summarySubtitleEl = document.getElementById('summarySubtitle');
const summaryGridEl = document.getElementById('summaryGrid');
const summaryHrChartEl = document.getElementById('summaryHrChart');
const summaryZoneBarEl = document.getElementById('summaryZoneBar');
const summaryZoneLegendEl = document.getElementById('summaryZoneLegend');
const summaryDeleteBtn = document.getElementById('summaryDeleteBtn');
const summaryCloseBtn = document.getElementById('summaryCloseBtn');
const historyDialog = document.getElementById('historyDialog');
const historyTotalsEl = document.getElementById('historyTotals');
const historyListEl = document.getElementById('historyList');
const historyCloseBtn = document.getElementById('historyCloseBtn');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

// ---------- Heart rate via Web Bluetooth ----------

let currentHr = null;
let hrDevice = null;

function parseHeartRate(dataView) {
  const flags = dataView.getUint8(0);
  const is16bit = flags & 0x01;
  let offset = 1;
  let hr;
  if (is16bit) {
    hr = dataView.getUint16(offset, true);
  } else {
    hr = dataView.getUint8(offset);
  }
  return hr;
}

async function connectSensor() {
  if (!navigator.bluetooth) {
    setStatus('Web Bluetooth not available in this browser. Use Bluefy on iPhone.', 'error');
    return;
  }
  try {
    setStatus('Requesting device…');
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ services: ['heart_rate'] }],
    });
    hrDevice = device;
    device.addEventListener('gattserverdisconnected', onDisconnected);

    setStatus('Connecting…');
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService('heart_rate');
    const characteristic = await service.getCharacteristic('heart_rate_measurement');
    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event) => {
      currentHr = parseHeartRate(event.target.value);
      renderHr();
    });

    setStatus('Connected to ' + (device.name || 'sensor'), 'connected');
    connectBtn.textContent = 'Disconnect';
  } catch (err) {
    if (err.name === 'NotFoundError') {
      setStatus('No device selected.', 'error');
    } else {
      setStatus('Connection failed: ' + err.message, 'error');
    }
  }
}

function onDisconnected() {
  setStatus('Sensor disconnected', 'error');
  connectBtn.textContent = 'Connect Sensor';
  currentHr = null;
  renderHr();
}

connectBtn.addEventListener('click', () => {
  if (hrDevice && hrDevice.gatt.connected) {
    hrDevice.gatt.disconnect();
  } else {
    connectSensor();
  }
});

const HR_ZONES = [
  { max: 0.5, label: 'Resting', className: 'zone-resting' },
  { max: 0.6, label: 'Zone 1 · Warm up', className: 'zone-1' },
  { max: 0.7, label: 'Zone 2 · Easy', className: 'zone-2' },
  { max: 0.8, label: 'Zone 3 · Moderate', className: 'zone-3' },
  { max: 0.9, label: 'Zone 4 · Hard', className: 'zone-4' },
  { max: Infinity, label: 'Zone 5 · Max', className: 'zone-5' },
];

function hrZoneInfo(hr) {
  if (!profile || !hr) return null;
  const maxHr = 220 - profile.age;
  const pct = hr / maxHr;
  return HR_ZONES.find((z) => pct < z.max);
}

let beatTimeout = null;
function renderHr() {
  hrValueEl.textContent = currentHr != null ? currentHr : '--';
  const zone = hrZoneInfo(currentHr);
  hrZoneEl.textContent = zone ? zone.label : '';
  hrTileEl.classList.remove(...HR_ZONES.map((z) => z.className));
  if (zone) hrTileEl.classList.add(zone.className);
  if (currentHr != null) {
    hrTileEl.classList.add('beat');
    clearTimeout(beatTimeout);
    beatTimeout = setTimeout(() => hrTileEl.classList.remove('beat'), 200);
  }
  checkHrAlert(currentHr);
}

// ---------- HR threshold sound alerts ----------
// Tiny beeps so you can stay heads-up on the bike: a low chirp when HR
// drops below the min, a double high chirp when it goes above the max.

let audioCtx = null;

function unlockAudio() {
  if (!audioCtx) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return null;
    audioCtx = new AudioCtor();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playBeep(freq, durationMs, delayMs = 0) {
  const ctx = audioCtx;
  if (!ctx) return;
  const start = ctx.currentTime + delayMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + durationMs / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + durationMs / 1000 + 0.02);
}

function playAlertSound(kind) {
  if (!audioCtx && !unlockAudio()) return;
  if (kind === 'low') {
    playBeep(330, 110); // single low chirp: HR below range
  } else if (kind === 'high') {
    playBeep(1046, 90); // double high chirp: HR above range
    playBeep(1046, 90, 130);
  }
}

let lastAlertKind = null;
let lastAlertTime = 0;
const ALERT_REPEAT_MS = 8000;

function checkHrAlert(hr) {
  if (!running || paused || !profile || !profile.hrAlertsEnabled || hr == null) {
    lastAlertKind = null;
    return;
  }
  const { hrMin, hrMax } = profile;
  let kind = null;
  if (typeof hrMin === 'number' && !Number.isNaN(hrMin) && hr < hrMin) {
    kind = 'low';
  } else if (typeof hrMax === 'number' && !Number.isNaN(hrMax) && hr > hrMax) {
    kind = 'high';
  }

  if (kind) {
    const now = Date.now();
    if (kind !== lastAlertKind || now - lastAlertTime >= ALERT_REPEAT_MS) {
      playAlertSound(kind);
      lastAlertTime = now;
    }
  }
  lastAlertKind = kind;
}

// ---------- Speed & distance via GPS ----------

let watchId = null;
let lastPos = null;
let startPos = null;
let distanceKm = 0;
let straightLineKm = 0;
let currentSpeedKmh = 0;
let lastAltitude = null;
let elevationGainM = 0;
let hasAltitudeData = false;
const MIN_ELEVATION_DELTA_M = 0.5; // noise-threshold filter, mirrors the dKm < 0.3 distance-jump filter
const MAX_ALTITUDE_ACCURACY_M = 25; // ignore fixes with poor altitude accuracy

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function startGps() {
  if (!navigator.geolocation) {
    setStatus('Geolocation not available.', 'error');
    return;
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, speed, accuracy, altitude, altitudeAccuracy } = pos.coords;
      if (accuracy && accuracy > 50) return; // ignore very poor fixes

      if (typeof speed === 'number' && speed !== null && !Number.isNaN(speed)) {
        currentSpeedKmh = Math.max(0, speed * 3.6);
      } else if (lastPos) {
        const dtSec = (pos.timestamp - lastPos.timestamp) / 1000;
        if (dtSec > 0) {
          const dKm = haversineKm(lastPos.lat, lastPos.lon, latitude, longitude);
          currentSpeedKmh = Math.max(0, (dKm / dtSec) * 3600);
        }
      }

      if (lastPos) {
        const dKm = haversineKm(lastPos.lat, lastPos.lon, latitude, longitude);
        if (dKm < 0.3 && !autoPaused) distanceKm += dKm; // filter GPS jumps; freeze odometer while auto-paused
      }
      lastPos = { lat: latitude, lon: longitude, timestamp: pos.timestamp };

      if (!startPos) startPos = { lat: latitude, lon: longitude };
      straightLineKm = haversineKm(startPos.lat, startPos.lon, latitude, longitude);

      if (
        typeof altitude === 'number' && !Number.isNaN(altitude) &&
        !(typeof altitudeAccuracy === 'number' && altitudeAccuracy > MAX_ALTITUDE_ACCURACY_M)
      ) {
        const firstFix = !hasAltitudeData;
        hasAltitudeData = true;
        if (lastAltitude != null) {
          const dAlt = altitude - lastAltitude;
          if (dAlt > MIN_ELEVATION_DELTA_M) elevationGainM += dAlt;
        }
        lastAltitude = altitude;
        elevGainValueEl.textContent = Math.round(elevationGainM);
        if (firstFix) elevGainTileEl.classList.remove('hidden');
      }

      speedValueEl.textContent = currentSpeedKmh.toFixed(1);
      distValueEl.textContent = distanceKm.toFixed(2);
      straightDistValueEl.textContent = straightLineKm.toFixed(2);
    },
    (err) => setStatus('GPS error: ' + err.message, 'error'),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
}

function stopGps() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  lastPos = null;
  currentSpeedKmh = 0;
  speedValueEl.textContent = '0.0';
}

// ---------- Keep screen awake while riding ----------

let wakeLock = null;

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch {
    wakeLock = null;
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (running && document.visibilityState === 'visible') requestWakeLock();
});

// ---------- Live charts ----------

let hrHistory = [];
let speedHistory = [];
const MAX_CHART_POINTS = 1800; // 30 min at 1 point/sec

function drawLineChart(canvas, values, color, min, max) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const points = values.filter((v) => v != null);
  if (points.length < 2) return;

  const pad = 4;
  const span = max - min || 1;
  const xStep = (w - pad * 2) / (values.length - 1);

  ctx.beginPath();
  let started = false;
  values.forEach((v, i) => {
    const x = pad + i * xStep;
    if (v == null) { started = false; return; }
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    if (!started) { ctx.moveTo(x, y); started = true; } else { ctx.lineTo(x, y); }
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawCharts() {
  const hrValues = hrHistory.map((p) => p.v);
  const speedValues = speedHistory.map((p) => p.v);

  const presentHr = hrValues.filter((v) => v != null);
  const hrMin = presentHr.length ? Math.min(50, Math.min(...presentHr) - 5) : 60;
  const hrMax = presentHr.length ? Math.max(190, Math.max(...presentHr) + 5) : 200;
  drawLineChart(hrChartEl, hrValues, '#ff5a5f', hrMin, hrMax);
  hrRangeEl.textContent = presentHr.length
    ? `${Math.min(...presentHr)}–${Math.max(...presentHr)} bpm`
    : '';

  const presentSpeed = speedValues.filter((v) => v != null);
  const speedMax = presentSpeed.length ? Math.max(20, Math.max(...presentSpeed) * 1.15) : 20;
  drawLineChart(speedChartEl, speedValues, '#4f9cf9', 0, speedMax);
  speedRangeEl.textContent = presentSpeed.length
    ? `0–${speedMax.toFixed(0)} km/h`
    : '';
}

function resetCharts() {
  hrHistory = [];
  speedHistory = [];
  drawCharts();
}

// ---------- Session: timer + calories ----------

let running = false;
let paused = false;
let autoPaused = false;
let lowSpeedTicks = 0;
let elapsedSec = 0;
let calories = 0;
let tickInterval = null;

const AUTO_PAUSE_SPEED_KMH = 2;
const AUTO_RESUME_SPEED_KMH = 4; // hysteresis gap so it doesn't flap at one threshold
const AUTO_PAUSE_TICKS = 3; // seconds of sustained low speed before pausing

// full-resolution samples for the ride currently in progress, used to
// build the post-ride summary (independent of the capped live chart data)
let rideHrSamples = [];
let rideSpeedSamples = [];
let zoneSeconds = {};

function keytelCaloriesPerMin(hr) {
  if (!profile || !hr) return 0;
  const { weight, age, sex } = profile;
  let kcalPerMin;
  if (sex === 'male') {
    kcalPerMin = (-55.0969 + 0.6309 * hr + 0.1988 * weight + 0.2017 * age) / 4.184;
  } else {
    kcalPerMin = (-20.4022 + 0.4472 * hr - 0.1263 * weight + 0.074 * age) / 4.184;
  }
  return Math.max(0, kcalPerMin);
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function tick() {
  if (autoPaused) {
    if (currentSpeedKmh > AUTO_RESUME_SPEED_KMH) {
      autoPaused = false;
      lowSpeedTicks = 0;
      setStatus('Ride in progress', 'connected');
    }
    return; // skip all per-tick accumulation while auto-paused
  }

  elapsedSec += 1;
  timeValueEl.textContent = formatTime(elapsedSec);

  if (currentHr != null) {
    calories += keytelCaloriesPerMin(currentHr) / 60;
    calValueEl.textContent = Math.round(calories);
  }

  hrHistory.push({ v: currentHr });
  speedHistory.push({ v: currentSpeedKmh });
  if (hrHistory.length > MAX_CHART_POINTS) hrHistory.shift();
  if (speedHistory.length > MAX_CHART_POINTS) speedHistory.shift();
  drawCharts();

  rideHrSamples.push(currentHr);
  rideSpeedSamples.push(currentSpeedKmh);
  const zone = hrZoneInfo(currentHr);
  if (zone) zoneSeconds[zone.className] = (zoneSeconds[zone.className] || 0) + 1;
  renderZoneBar(zoneSeconds, liveZoneBarEl, liveZoneLegendEl);

  if (currentSpeedKmh < AUTO_PAUSE_SPEED_KMH) {
    lowSpeedTicks += 1;
    if (lowSpeedTicks >= AUTO_PAUSE_TICKS) {
      autoPaused = true;
      setStatus('Auto-paused (stopped)');
    }
  } else {
    lowSpeedTicks = 0;
  }
}

startBtn.addEventListener('click', () => {
  if (!profile) {
    openSettings();
    return;
  }
  running = true;
  paused = false;
  autoPaused = false;
  lowSpeedTicks = 0;
  lastAlertKind = null;
  document.body.classList.add('riding');
  unlockAudio();
  rideHrSamples = [];
  rideSpeedSamples = [];
  zoneSeconds = {};
  startPos = null;
  straightLineKm = 0;
  lastAltitude = null;
  elevationGainM = 0;
  hasAltitudeData = false;
  straightDistValueEl.textContent = '0.00';
  elevGainTileEl.classList.add('hidden');
  renderZoneBar({}, liveZoneBarEl, liveZoneLegendEl);
  startGps();
  requestWakeLock();
  tickInterval = setInterval(tick, 1000);
  startBtn.disabled = true;
  pauseBtn.disabled = false;
  pauseBtn.textContent = 'Pause';
  stopBtn.disabled = false;
  resetBtn.disabled = true;
  setStatus('Ride in progress', 'connected');
});

pauseBtn.addEventListener('click', () => {
  if (!running) return;
  paused = !paused;
  lastAlertKind = null;
  autoPaused = false;
  lowSpeedTicks = 0;
  if (paused) {
    stopGps();
    clearInterval(tickInterval);
    tickInterval = null;
    pauseBtn.textContent = 'Resume';
    setStatus('Ride paused');
  } else {
    startGps();
    tickInterval = setInterval(tick, 1000);
    pauseBtn.textContent = 'Pause';
    setStatus('Ride in progress', 'connected');
  }
});

stopBtn.addEventListener('click', () => {
  running = false;
  paused = false;
  autoPaused = false;
  lowSpeedTicks = 0;
  lastAlertKind = null;
  document.body.classList.remove('riding');
  stopGps();
  releaseWakeLock();
  clearInterval(tickInterval);
  startBtn.disabled = false;
  pauseBtn.disabled = true;
  pauseBtn.textContent = 'Pause';
  stopBtn.disabled = true;
  resetBtn.disabled = false;

  if (elapsedSec >= MIN_RIDE_SEC) {
    const ride = buildRideSummary();
    addRideToHistory(ride);
    setStatus('Ride saved', 'connected');
    renderRideSummary(ride);
  } else {
    setStatus('Ride stopped');
  }
});

resetBtn.addEventListener('click', () => {
  elapsedSec = 0;
  calories = 0;
  distanceKm = 0;
  currentSpeedKmh = 0;
  startPos = null;
  straightLineKm = 0;
  lastAltitude = null;
  elevationGainM = 0;
  hasAltitudeData = false;
  timeValueEl.textContent = '00:00';
  calValueEl.textContent = '0';
  distValueEl.textContent = '0.00';
  speedValueEl.textContent = '0.0';
  straightDistValueEl.textContent = '0.00';
  elevGainTileEl.classList.add('hidden');
  renderZoneBar({}, liveZoneBarEl, liveZoneLegendEl);
  resetCharts();
});

// ---------- Ride history & fancy post-ride summary ----------

const HISTORY_KEY = 'ridestats.history';
const MAX_HISTORY_RIDES = 200;
const SUMMARY_SAMPLE_POINTS = 120;
const MIN_RIDE_SEC = 10; // ignore accidental start/stop taps

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistoryList(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

function downsample(values, n) {
  if (values.length <= n) return values.slice();
  const out = [];
  const step = values.length / n;
  for (let i = 0; i < n; i++) out.push(values[Math.floor(i * step)]);
  return out;
}

function buildRideSummary() {
  const hrPresent = rideHrSamples.filter((v) => v != null);
  const avgHr = hrPresent.length
    ? Math.round(hrPresent.reduce((a, b) => a + b, 0) / hrPresent.length)
    : null;
  const maxHr = hrPresent.length ? Math.max(...hrPresent) : null;
  const minHr = hrPresent.length ? Math.min(...hrPresent) : null;
  const maxSpeed = rideSpeedSamples.length ? Math.max(...rideSpeedSamples) : 0;
  const avgSpeed = elapsedSec > 0 ? distanceKm / (elapsedSec / 3600) : 0;

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    date: new Date().toISOString(),
    durationSec: elapsedSec,
    distanceKm,
    calories: Math.round(calories),
    avgSpeed,
    maxSpeed,
    avgHr,
    maxHr,
    minHr,
    zoneSeconds,
    elevationGainM: hasAltitudeData ? Math.round(elevationGainM) : null,
    hrSamples: downsample(rideHrSamples, SUMMARY_SAMPLE_POINTS),
  };
}

function addRideToHistory(ride) {
  const history = loadHistory();
  history.unshift(ride);
  if (history.length > MAX_HISTORY_RIDES) history.length = MAX_HISTORY_RIDES;
  saveHistoryList(history);
  return history;
}

function deleteRide(id) {
  saveHistoryList(loadHistory().filter((r) => r.id !== id));
  renderHistoryList();
}

function formatDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSec % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function formatRideDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function dominantZone(ride) {
  const entries = Object.entries(ride.zoneSeconds || {});
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return HR_ZONES.find((z) => z.className === entries[0][0]) || null;
}

function statHtml(label, value, unit) {
  return `<div class="summary-stat"><div class="stat-label">${label}</div>` +
    `<div class="stat-value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</div></div>`;
}

function statMiniHtml(label, value) {
  return `<div class="stat-mini"><div class="stat-value">${value}</div><div class="stat-label">${label}</div></div>`;
}

function renderZoneBar(zoneSecondsObj, barEl, legendEl) {
  const totalZoneSec = Object.values(zoneSecondsObj || {}).reduce((a, b) => a + b, 0);
  barEl.innerHTML = '';
  legendEl.innerHTML = '';
  if (totalZoneSec > 0) {
    HR_ZONES.forEach((z) => {
      const sec = (zoneSecondsObj || {})[z.className] || 0;
      if (sec <= 0) return;
      const pct = (sec / totalZoneSec) * 100;

      const seg = document.createElement('div');
      seg.className = 'zone-bar-seg ' + z.className;
      seg.style.width = pct.toFixed(1) + '%';
      barEl.appendChild(seg);

      const item = document.createElement('div');
      item.className = 'zone-legend-item';
      item.innerHTML = `<span class="zone-dot ${z.className}"></span>${z.label.split(' · ')[0]} · ${formatDuration(sec)}`;
      legendEl.appendChild(item);
    });
  } else {
    legendEl.innerHTML = '<div class="history-empty">No heart rate data</div>';
  }
}

function renderRideSummary(ride) {
  summaryTitleEl.textContent = 'Ride Summary';
  summarySubtitleEl.textContent = formatRideDate(ride.date);

  summaryGridEl.innerHTML = [
    statHtml('Duration', formatDuration(ride.durationSec)),
    statHtml('Distance', ride.distanceKm.toFixed(2), 'km'),
    statHtml('Avg Speed', ride.avgSpeed.toFixed(1), 'km/h'),
    statHtml('Max Speed', ride.maxSpeed.toFixed(1), 'km/h'),
    statHtml('Calories', ride.calories, 'kcal'),
    statHtml('Avg HR', ride.avgHr != null ? ride.avgHr : '--', 'bpm'),
    statHtml('Max HR', ride.maxHr != null ? ride.maxHr : '--', 'bpm'),
    statHtml('Min HR', ride.minHr != null ? ride.minHr : '--', 'bpm'),
    ...(ride.elevationGainM != null ? [statHtml('Elevation Gain', ride.elevationGainM, 'm')] : []),
  ].join('');

  renderZoneBar(ride.zoneSeconds, summaryZoneBarEl, summaryZoneLegendEl);

  summaryDeleteBtn.onclick = () => {
    deleteRide(ride.id);
    summaryDialog.close();
  };

  summaryDialog.showModal();
  requestAnimationFrame(() => {
    drawLineChart(
      summaryHrChartEl,
      ride.hrSamples,
      '#ff5a5f',
      ride.minHr != null ? ride.minHr - 5 : 60,
      ride.maxHr != null ? ride.maxHr + 5 : 200
    );
  });
}

function renderHistoryList() {
  const history = loadHistory();
  const totalDistance = history.reduce((a, r) => a + r.distanceKm, 0);
  const totalDuration = history.reduce((a, r) => a + r.durationSec, 0);

  historyTotalsEl.innerHTML = [
    statMiniHtml('Rides', history.length),
    statMiniHtml('Distance', totalDistance.toFixed(1) + ' km'),
    statMiniHtml('Time', formatDuration(totalDuration)),
  ].join('');

  if (!history.length) {
    historyListEl.innerHTML = '<div class="history-empty">No rides yet. Start riding to build your history.</div>';
    return;
  }

  historyListEl.innerHTML = '';
  history.forEach((ride) => {
    const zone = dominantZone(ride);
    const row = document.createElement('div');
    row.className = 'history-item';
    row.innerHTML = `
      <div class="history-item-main">
        <div class="history-item-date">${formatRideDate(ride.date)}</div>
        <div class="history-item-sub">${ride.distanceKm.toFixed(2)} km · ${formatDuration(ride.durationSec)} · ${ride.calories} kcal</div>
      </div>
      <div class="history-item-stats">
        ${ride.avgHr != null ? `<span class="history-item-hr ${zone ? zone.className : ''}">${ride.avgHr} bpm</span>` : ''}
        <button type="button" class="history-item-del" aria-label="Delete ride">🗑</button>
      </div>
    `;
    row.querySelector('.history-item-main').addEventListener('click', () => renderRideSummary(ride));
    const hrBadge = row.querySelector('.history-item-hr');
    if (hrBadge) hrBadge.addEventListener('click', () => renderRideSummary(ride));
    row.querySelector('.history-item-del').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRide(ride.id);
    });
    historyListEl.appendChild(row);
  });
}

historyBtn.addEventListener('click', () => {
  renderHistoryList();
  historyDialog.showModal();
});
historyCloseBtn.addEventListener('click', () => historyDialog.close());
summaryCloseBtn.addEventListener('click', () => summaryDialog.close());
summaryDialog.addEventListener('close', () => {
  if (historyDialog.open) renderHistoryList();
});

// register service worker for offline/installable use, if available
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
