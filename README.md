# 🚗 TRACKVISION — Premium Vehicle Tracking Dashboard

<p align="center">
  <b>Real-Time GPS Vehicle Monitoring & Route Replay System</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/ESP32-IoT-00C853?style=for-the-badge&logo=espressif&logoColor=white">
  <img src="https://img.shields.io/badge/Firebase-Realtime%20Database-FFCA28?style=for-the-badge&logo=firebase&logoColor=black">
  <img src="https://img.shields.io/badge/Leaflet.js-Maps-199900?style=for-the-badge&logo=leaflet&logoColor=white">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img src="https://img.shields.io/badge/Responsive-Design-2196F3?style=for-the-badge">
</p>

---

## ✨ Overview

**TRACKVISION** is a modern real-time vehicle tracking dashboard designed to monitor GPS-based vehicle telemetry using an **ESP32 + GP-02 GNSS module**.

The system receives live GPS data from the ESP32 and stores it in **Firebase Realtime Database**. The web dashboard then visualizes the vehicle's current position, speed, satellite information, route history, and daily journey.

The dashboard is designed with a **premium automotive / IoT interface**, featuring smooth animations, glassmorphism-style panels, live status indicators, animated vehicle movement, interactive maps, and journey replay.

---

## 🎯 Key Features

### 📡 Real-Time GPS Monitoring

- Live vehicle location
- Latitude and longitude
- Current speed
- Connected GPS satellites
- GPS timestamp
- Real-time Firebase synchronization
- Automatic online/offline detection

### 🗺️ Interactive Live Map

- Real-time vehicle marker
- Animated vehicle marker
- Route visualization
- Live coordinate overlay
- Center vehicle button
- Route visibility toggle
- Automatic map following
- Interactive Leaflet map

### 🚘 Vehicle Movement Animation

TRACKVISION doesn't simply move the marker from one GPS point to another.

The dashboard uses smooth movement interpolation to create a more realistic vehicle-tracking experience.

Features include:

- Smooth marker transitions
- Direction-aware vehicle movement
- Animated GPS marker
- Live route drawing
- Vehicle pulse effects
- Automatic map tracking

---

## 📊 Live Telemetry

The dashboard displays important vehicle statistics in real time.

| Metric | Description |
|---|---|
| 🚀 Live Speed | Current vehicle speed |
| 🏁 Top Speed | Highest recorded speed |
| 📍 Distance | Calculated route distance |
| 🛰️ Satellites | Connected GNSS satellites |
| 🌐 Latitude | Current latitude |
| 🌐 Longitude | Current longitude |
| ⏱️ GPS Time | Latest GPS update |

---

## 🔁 Daily Journey Replay

One of the main features of TRACKVISION is the **Daily Trip Replay System**.

The dashboard stores moving GPS points and allows the user to replay the vehicle's journey.

### Replay Controls

- ⏮ Journey Start
- ↶ Step Back
- ▶ Play / Pause
- ↷ Step Forward
- ⏭ Journey End
- Adjustable playback speed
- Interactive timeline slider

### Playback Speeds

```text
0.5×
1×
2×
4×
8×
