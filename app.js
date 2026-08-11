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

function openSettings() {
  if (profile) {
    weightInput.value = profile.weight;
    ageInput.value = profile.age;
    sexInput.value = profile.sex;
  }
  settingsDialog.showModal();
}

document.getElementById('settingsBtn').addEventListener('click', openSettings);

settingsForm.addEventListener('submit', () => {
  profile = {
    weight: parseFloat(weightInput.value),
    age: parseInt(ageInput.value, 10),
    sex: sexInput.value,
  };
  saveProfile(profile);
});

if (!profile) openSettings();

// ---------- DOM ----------

const hrValueEl = document.getElementById('hrValue');
const hrTileEl = document.getElementById('hrTile');
const hrZoneEl = document.getElementById('hrZone');
const speedValueEl = document.getElementById('speedValue');
const distValueEl = document.getElementById('distValue');
const calValueEl = document.getElementById('calValue');
const timeValueEl = document.getElementById('timeValue');
const statusEl = document.getElementById('status');
const connectBtn = document.getElementById('connectBtn');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const resetBtn = document.getElementById('resetBtn');

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
    startBtn.disabled = false;
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

function hrZoneLabel(hr) {
  if (!profile || !hr) return '';
  const maxHr = 220 - profile.age;
  const pct = hr / maxHr;
  if (pct < 0.5) return 'Resting';
  if (pct < 0.6) return 'Zone 1 · Warm up';
  if (pct < 0.7) return 'Zone 2 · Easy';
  if (pct < 0.8) return 'Zone 3 · Moderate';
  if (pct < 0.9) return 'Zone 4 · Hard';
  return 'Zone 5 · Max';
}

let beatTimeout = null;
function renderHr() {
  hrValueEl.textContent = currentHr != null ? currentHr : '--';
  hrZoneEl.textContent = currentHr != null ? hrZoneLabel(currentHr) : '';
  if (currentHr != null) {
    hrTileEl.classList.add('beat');
    clearTimeout(beatTimeout);
    beatTimeout = setTimeout(() => hrTileEl.classList.remove('beat'), 200);
  }
}

// ---------- Speed & distance via GPS ----------

let watchId = null;
let lastPos = null;
let distanceKm = 0;
let currentSpeedKmh = 0;

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
      const { latitude, longitude, speed, accuracy } = pos.coords;
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
        if (dKm < 0.3) distanceKm += dKm; // filter GPS jumps
      }
      lastPos = { lat: latitude, lon: longitude, timestamp: pos.timestamp };

      speedValueEl.textContent = currentSpeedKmh.toFixed(1);
      distValueEl.textContent = distanceKm.toFixed(2);
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

// ---------- Session: timer + calories ----------

let running = false;
let elapsedSec = 0;
let calories = 0;
let tickInterval = null;

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
  elapsedSec += 1;
  timeValueEl.textContent = formatTime(elapsedSec);

  if (currentHr != null) {
    calories += keytelCaloriesPerMin(currentHr) / 60;
    calValueEl.textContent = Math.round(calories);
  }
}

startBtn.addEventListener('click', () => {
  if (!profile) {
    openSettings();
    return;
  }
  running = true;
  startGps();
  tickInterval = setInterval(tick, 1000);
  startBtn.disabled = true;
  stopBtn.disabled = false;
  resetBtn.disabled = true;
  setStatus('Ride in progress', 'connected');
});

stopBtn.addEventListener('click', () => {
  running = false;
  stopGps();
  clearInterval(tickInterval);
  startBtn.disabled = false;
  stopBtn.disabled = true;
  resetBtn.disabled = false;
  setStatus('Ride stopped');
});

resetBtn.addEventListener('click', () => {
  elapsedSec = 0;
  calories = 0;
  distanceKm = 0;
  currentSpeedKmh = 0;
  timeValueEl.textContent = '00:00';
  calValueEl.textContent = '0';
  distValueEl.textContent = '0.00';
  speedValueEl.textContent = '0.0';
});

// register service worker for offline/installable use, if available
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
