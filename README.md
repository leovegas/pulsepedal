# Ride Stats

A tiny, no-backend web app that turns your phone into a bike computer: connect a Bluetooth LE heart rate strap, track speed and distance with GPS, and get a live calorie estimate — all in the browser, nothing installed, nothing uploaded.

**Live app:** https://leovegas.github.io/ride-stats/

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![No backend](https://img.shields.io/badge/backend-none-brightgreen.svg)
![Web Bluetooth](https://img.shields.io/badge/uses-Web%20Bluetooth-orange.svg)

## Features

- **Heart rate** — live BPM from any BLE strap that implements the standard [GATT Heart Rate service](https://www.bluetooth.com/specifications/specs/heart-rate-service-1-0/) (most generic HR straps, including MooFit's).
- **Speed & distance** — from the phone's GPS, with basic filtering for noisy/low-accuracy fixes.
- **Calories** — estimated per second from heart rate using the [Keytel et al. (2005)](https://pubmed.ncbi.nlm.nih.gov/15966347/) regression formula, personalized to your weight/age/sex.
- **Heart rate zones** — simple % of estimated max HR (`220 − age`).
- Installable as a home-screen app (PWA manifest + service worker), works offline once loaded.
- **No account, no server, no analytics.** Your profile (weight/age/sex) is saved only in your browser's `localStorage`. Ride data isn't stored or sent anywhere — refreshing the page clears it.

## Requirements

Connecting to a Bluetooth sensor from a web page requires the [Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API), which isn't available everywhere:

| Platform | Works? | Notes |
|---|---|---|
| Android — Chrome / Edge | ✅ | Works out of the box. |
| Desktop — Chrome / Edge | ✅ | On Linux you may need to enable `chrome://flags/#enable-web-bluetooth-new-permissions-backend` and relaunch. |
| iPhone / iPad | ⚠️ | Safari and *every* other iOS browser (including Chrome) sit on Apple's WebKit engine, which has no Web Bluetooth support. Use **[Bluefy](https://apps.apple.com/app/bluefy-web-ble-browser/id1492822055)** — a free browser app that adds it. |
| Firefox (any platform) | ❌ | No Web Bluetooth support. |

The page must also be loaded over `https://` (or `http://localhost` during development) — Web Bluetooth and Geolocation both refuse to run over a plain, non-secure `http://` connection.

## Usage

1. Open the live app URL above (in Chrome on Android/desktop, or Bluefy on iPhone).
2. Tap ⚙️ and enter your weight, age, and sex — used only for the calorie estimate.
3. Put on your HR strap and tap **Connect Sensor**; pick it from the device list.
4. Tap **Start Ride**, allow location access, and go. Tap **Stop** when you're done, **Reset** to zero everything out.

## Local development

No build step or dependencies — it's plain HTML/CSS/JS.

```bash
git clone https://github.com/leovegas/ride-stats.git
cd ride-stats
python3 -m http.server 8787
```

Open `http://localhost:8787` in Chrome/Edge. `localhost` counts as a secure context, so Web Bluetooth and Geolocation both work there without needing HTTPS.

## How it works

- **Heart rate**: `navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] })` → subscribes to the `heart_rate_measurement` characteristic and parses the flags byte per the Bluetooth SIG spec (8-bit or 16-bit BPM value).
- **Speed/distance**: `navigator.geolocation.watchPosition` — prefers the device-reported `coords.speed`, falls back to a haversine distance calculation between fixes, and discards low-accuracy or physically-implausible jumps.
- **Calories**: integrated once per second from the current HR using the Keytel formula (separate coefficients for male/female).

## Project layout

```
index.html    — markup
style.css     — styling
app.js        — all app logic (Bluetooth, GPS, calorie calc, timer)
manifest.json — PWA manifest
sw.js         — service worker (offline caching)
```

## License

[MIT](LICENSE)
