import {
    initializeApp
} from "https://www..com/firebasejs/10.12.2/firebase-app.js";

import {
    getDatabase,
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/10..2/firebase-database.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com//.12.2/firebase-auth.js";


/* =========================================================
   FIREBASE
========================================================= */

    apiKey: "AIzaSyA1-eCoOIz0a2cxDe3LsMV3aG_e-7Ioyug",

    authDomain:
        "vehicle-tracking-system-baac1.firebaseapp.com",

    databaseURL:
        "https://vehicle-tracking-system-baac1-default-rtdb.asia-southeast1.firebasedatabase.app",

    projectId:
        "vehicle-tracking-system-baac1",

    storageBucket:
        "vehicle-tracking-system-baac1.firebasestorage.app",

    messagingSenderId:
        "234635677085",

    appId:
        "1:234635677085:web:60df702cffd2730dd8f374"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);


/* =========================================================
   CONFIGURATION
========================================================= */

const DEFAULT_POSITION = [23.8103, 90.4125];

const HEARTBEAT_TIMEOUT = 10000;
const GPS_STALE_TIMEOUT = 10000;

const MAIN_MAP_ZOOM = 16;
const MAX_SPEED_DISPLAY = 120;

const MARKER_ANIMATION_DURATION = 900;


/* =========================================================
   STATE
========================================================= */

let map;
let vehicleMarker;
let routeLine;
let routeGlowLine;

let routeVisible = true;
let autoFollow = true;

let historyData = [];
let latestGPS = null;

let lastGPSUpdate = 0;
let lastHeartbeat = 0;

let deviceOnline = false;
let previousDeviceOnline = false;

let markerAnimationFrame = null;
let markerAnimationStart = null;
let markerAnimationFrom = null;
let markerAnimationTo = null;

let mainRouteInitialized = false;


/* =========================================================
   REPLAY STATE
========================================================= */

let replayMap;
let replayFullRoute;
let replayRoute;
let replayMarker;

let replayData = [];
let replayIndex = 0;

let replayPlaying = false;
let replayAnimationFrame = null;

let replaySegmentStart = 0;
let replaySegmentFrom = null;
let replaySegmentTo = null;

let replayDirection = 0;


/* =========================================================
   VEHICLE ICON
========================================================= */

const vehicleIcon = L.divIcon({
    className: "",
    html: `
        <div class="vehicle-marker">
            <span>🚗</span>
        </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    popupAnchor: [0, -25]
});


/* =========================================================
   MAIN MAP
========================================================= */

map = L.map("map", {
    zoomControl: true,
    attributionControl: true
}).setView(DEFAULT_POSITION, 13);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);


/* =========================================================
   ROUTE LAYERS
========================================================= */

routeGlowLine = L.polyline([], {
    color: "#66f2a5",
    weight: 10,
    opacity: 0.10,
    smoothFactor: 1
}).addTo(map);

routeLine = L.polyline([], {
    color: "#66f2a5",
    weight: 4,
    opacity: 0.80,
    smoothFactor: 1
}).addTo(map);


/* =========================================================
   FIREBASE
========================================================= */

async function startFirebase() {

    try {

        await signInAnonymously(auth);

        console.log(
            "Firebase anonymous authentication successful."
        );

        listenToFirebase();

    } catch (error) {

        console.error(
            "Firebase authentication failed:",
            error
        );

        updateConnection(
            false,
            "Authentication failed"
        );
    }
}


/* =========================================================
   FIREBASE LISTENERS
========================================================= */

function listenToFirebase() {

    const gpsRef = ref(
        database,
        "gps"
    );

    const historyRef = ref(
        database,
        "history"
    );

    const heartbeatRef = ref(
        database,
        "status/heartbeat"
    );


    /* ---------- GPS ---------- */

    onValue(
        gpsRef,
        snapshot => {

            const data = snapshot.val();

            if (!data) {
                return;
            }

            const lat = Number(data.lat);
            const lng = Number(data.lng);

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lng)
            ) {
                return;
            }

            latestGPS = data;

            lastGPSUpdate = Date.now();

            updateGPSDashboard(data);

        },
        error => {

            console.error(
                "GPS listener error:",
                error
            );
        }
    );


    /* ---------- History ---------- */

    onValue(
        historyRef,
        snapshot => {

            const data = snapshot.val();

            if (!data) {

                historyData = [];

                updateHistory([]);
                drawRoute([]);
                calculateStatistics([]);
                updateDailyReplay([]);

                return;
            }

            historyData = Object.entries(data)
                .map(([id, value]) => ({
                    id,
                    ...value
                }))
                .filter(item =>
                    Number.isFinite(Number(item.lat)) &&
                    Number.isFinite(Number(item.lng))
                )
                .sort(
                    (a, b) =>
                        getTimestamp(a) -
                        getTimestamp(b)
                );

            updateHistory(historyData);
            drawRoute(historyData);
            calculateStatistics(historyData);
            updateDailyReplay(historyData);

        },
        error => {

            console.error(
                "History listener error:",
                error
            );
        }
    );


    /* ---------- Heartbeat ---------- */

    onValue(
        heartbeatRef,
        snapshot => {

            const value = snapshot.val();

            const timestamp =
                normalizeTimestamp(value);

            if (!timestamp) {
                return;
            }

            lastHeartbeat = timestamp;

            evaluateConnection();

        },
        error => {

            console.error(
                "Heartbeat listener error:",
                error
            );

            updateConnection(
                false,
                "Heartbeat error"
            );
        }
    );
}


/* =========================================================
   GPS DASHBOARD
========================================================= */

function updateGPSDashboard(data) {

    const lat = Number(data.lat);
    const lng = Number(data.lng);

    const speed =
        Number.isFinite(Number(data.speed))
            ? Math.max(0, Number(data.speed))
            : 0;

    const sats =
        Number.isFinite(Number(data.sats))
            ? Math.max(0, Number(data.sats))
            : 0;


    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {
        return;
    }


    /* ---------- Speed ---------- */

    setText(
        "speedValue",
        speed.toFixed(1)
    );

    setText(
        "telemetrySpeed",
        `${speed.toFixed(1)} km/h`
    );


    const speedPercent =
        Math.min(
            (speed / MAX_SPEED_DISPLAY) * 100,
            100
        );

    setStyle(
        "speedBar",
        "width",
        `${speedPercent}%`
    );

    setText(
        "speedPercent",
        `${Math.round(speedPercent)}%`
    );


    /* ---------- Satellites ---------- */

    setText(
        "satelliteValue",
        sats
    );

    setText(
        "telemetrySatellites",
        sats
    );

    updateSatelliteBars(sats);


    /* ---------- Coordinates ---------- */

    setText(
        "latitude",
        lat.toFixed(6)
    );

    setText(
        "longitude",
        lng.toFixed(6)
    );

    setText(
        "mapCoordinates",
        `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    );


    /* ---------- Time ---------- */

    const timestamp =
        getTimestamp(data);

    setText(
        "gpsTime",
        formatDate(timestamp)
    );

    setText(
        "lastUpdate",
        `Updated ${formatTime(timestamp)}`
    );


    /* ---------- Map ---------- */

    updateVehicleMarker(
        lat,
        lng,
        speed,
        sats
    );


    evaluateConnection();
}


/* =========================================================
   VEHICLE MARKER
========================================================= */

function updateVehicleMarker(
    lat,
    lng,
    speed,
    sats
) {

    const target = [lat, lng];

    if (!vehicleMarker) {

        vehicleMarker = L.marker(
            target,
            {
                icon: vehicleIcon
            }
        ).addTo(map);

        vehicleMarker.bindPopup(
            createPopup(
                lat,
                lng,
                speed,
                sats
            )
        );

        map.setView(
            target,
            MAIN_MAP_ZOOM,
            {
                animate: true
            }
        );

        mainRouteInitialized = true;

        return;
    }


    const current =
        vehicleMarker.getLatLng();


    markerAnimationFrom = [
        current.lat,
        current.lng
    ];

    markerAnimationTo = target;

    markerAnimationStart = performance.now();


    if (markerAnimationFrame) {
        cancelAnimationFrame(
            markerAnimationFrame
        );
    }


    function animateMarker(now) {

        const elapsed =
            now - markerAnimationStart;

        const progress =
            Math.min(
                elapsed / MARKER_ANIMATION_DURATION,
                1
            );

        const eased =
            easeInOutCubic(progress);

        const lat =
            markerAnimationFrom[0] +
            (
                markerAnimationTo[0] -
                markerAnimationFrom[0]
            ) * eased;

        const lng =
            markerAnimationFrom[1] +
            (
                markerAnimationTo[1] -
                markerAnimationFrom[1]
            ) * eased;


        vehicleMarker.setLatLng([
            lat,
            lng
        ]);


        if (
            autoFollow &&
            map.getZoom() >= 14
        ) {

            map.panTo(
                [lat, lng],
                {
                    animate: false
                }
            );
        }


        if (progress < 1) {

            markerAnimationFrame =
                requestAnimationFrame(
                    animateMarker
                );

        } else {

            markerAnimationFrame = null;
        }
    }


    markerAnimationFrame =
        requestAnimationFrame(
            animateMarker
        );


    vehicleMarker.setPopupContent(
        createPopup(
            lat,
            lng,
            speed,
            sats
        )
    );
}


/* =========================================================
   POPUP
========================================================= */

function createPopup(
    lat,
    lng,
    speed,
    sats
) {

    return `
        <div style="
            min-width:190px;
            font-family:Inter,Arial,sans-serif;
            line-height:1.7;
        ">

            <strong style="
                color:#66f2a5;
                font-size:13px;
                letter-spacing:1px;
            ">
                TRACKVISION
            </strong>

            <hr style="
                border:0;
                border-top:1px solid #29313b;
                margin:7px 0;
            ">

            <div>
                <b>Latitude:</b>
                ${lat.toFixed(6)}
            </div>

            <div>
                <b>Longitude:</b>
                ${lng.toFixed(6)}
            </div>

            <div>
                <b>Speed:</b>
                ${speed.toFixed(1)} km/h
            </div>

            <div>
                <b>Satellites:</b>
                ${sats}
            </div>

            <div style="
                margin-top:5px;
                color:#66f2a5;
                font-weight:600;
            ">
                ● LIVE TRACKING
            </div>

        </div>
    `;
}


/* =========================================================
   ROUTE
========================================================= */

function drawRoute(data) {

    const points = data
        .filter(item =>
            Number.isFinite(Number(item.lat)) &&
            Number.isFinite(Number(item.lng))
        )
        .map(item => [
            Number(item.lat),
            Number(item.lng)
        ]);


    routeLine.setLatLngs(points);
    routeGlowLine.setLatLngs(points);


    if (
        points.length &&
        !mainRouteInitialized
    ) {

        map.fitBounds(
            routeLine.getBounds(),
            {
                padding: [40, 40]
            }
        );

        mainRouteInitialized = true;
    }
}


/* =========================================================
   ROUTE TOGGLE
========================================================= */

const routeToggleBtn =
    document.getElementById(
        "routeToggleBtn"
    );

if (routeToggleBtn) {

    routeToggleBtn.addEventListener(
        "click",
        () => {

            routeVisible =
                !routeVisible;

            if (routeVisible) {

                routeLine.addTo(map);
                routeGlowLine.addTo(map);

                routeToggleBtn.classList.add(
                    "active"
                );

                routeToggleBtn.innerHTML =
                    "◈ Route";

            } else {

                map.removeLayer(
                    routeLine
                );

                map.removeLayer(
                    routeGlowLine
                );

                routeToggleBtn.classList.remove(
                    "active"
                );

                routeToggleBtn.innerHTML =
                    "◇ Route";
            }
        }
    );
}


/* =========================================================
   CENTER MAP
========================================================= */

const centerMapBtn =
    document.getElementById(
        "centerMapBtn"
    );

if (centerMapBtn) {

    centerMapBtn.addEventListener(
        "click",
        () => {

            if (!latestGPS) {
                return;
            }

            const lat =
                Number(latestGPS.lat);

            const lng =
                Number(latestGPS.lng);

            if (
                !Number.isFinite(lat) ||
                !Number.isFinite(lng)
            ) {
                return;
            }

            autoFollow = true;

            map.setView(
                [lat, lng],
                MAIN_MAP_ZOOM,
                {
                    animate: true
                }
            );
        }
    );
}


/* =========================================================
   MAP INTERACTION
========================================================= */

map.on(
    "dragstart",
    () => {
        autoFollow = false;
    }
);

map.on(
    "zoomstart",
    () => {
        autoFollow = false;
    }
);


/* =========================================================
   STATISTICS
========================================================= */

function calculateStatistics(data) {

    if (!data.length) {

        setText(
            "topSpeed",
            "0.0"
        );

        setText(
            "distanceValue",
            "0.00"
        );

        return;
    }


    const topSpeed =
        Math.max(
            ...data.map(
                item =>
                    Number(item.speed) || 0
            )
        );


    let totalDistance = 0;


    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        totalDistance +=
            calculateDistance(
                Number(data[i - 1].lat),
                Number(data[i - 1].lng),
                Number(data[i].lat),
                Number(data[i].lng)
            );
    }


    setText(
        "topSpeed",
        topSpeed.toFixed(1)
    );

    setText(
        "distanceValue",
        totalDistance.toFixed(2)
    );
}


/* =========================================================
   DISTANCE
========================================================= */

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

    if (
        !Number.isFinite(lat1) ||
        !Number.isFinite(lon1) ||
        !Number.isFinite(lat2) ||
        !Number.isFinite(lon2)
    ) {
        return 0;
    }


    const R = 6371;

    const dLat =
        degreesToRadians(
            lat2 - lat1
        );

    const dLon =
        degreesToRadians(
            lon2 - lon1
        );


    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(
            degreesToRadians(lat1)
        ) *
        Math.cos(
            degreesToRadians(lat2)
        ) *
        Math.sin(dLon / 2) ** 2;


    const c =
        2 *
        Math.atan2(
            Math.sqrt(a),
            Math.sqrt(1 - a)
        );


    return R * c;
}


function degreesToRadians(
    degrees
) {

    return (
        degrees *
        Math.PI /
        180
    );
}


/* =========================================================
   SATELLITES
========================================================= */

function updateSatelliteBars(
    satellites
) {

    const bars =
        document.querySelectorAll(
            "#satelliteBars span"
        );


    const active =
        Math.min(
            Math.max(
                Number(satellites) || 0,
                0
            ),
            8
        );


    bars.forEach(
        (bar, index) => {

            const enabled =
                index < active;

            bar.style.background =
                enabled
                    ? "#66f2a5"
                    : "#26313d";

            bar.style.boxShadow =
                enabled
                    ? "0 0 7px rgba(102,242,165,.5)"
                    : "none";

            bar.classList.toggle(
                "active",
                enabled
            );
        }
    );


    const quality =
        document.getElementById(
            "gpsQuality"
        );

    if (!quality) {
        return;
    }


    if (satellites >= 10) {

        quality.textContent =
            "EXCELLENT";

    } else if (satellites >= 7) {

        quality.textContent =
            "GOOD";

    } else if (satellites >= 4) {

        quality.textContent =
            "FAIR";

    } else {

        quality.textContent =
            "NO SIGNAL";
    }
}


/* =========================================================
   CONNECTION ENGINE
========================================================= */

function evaluateConnection() {

    const now = Date.now();

    const heartbeatAge =
        lastHeartbeat
            ? now - lastHeartbeat
            : Infinity;

    const gpsAge =
        lastGPSUpdate
            ? now - lastGPSUpdate
            : Infinity;


    const heartbeatAlive =
        heartbeatAge <= HEARTBEAT_TIMEOUT;


    const gpsAlive =
        gpsAge <= GPS_STALE_TIMEOUT;


    const online =
        heartbeatAlive &&
        gpsAlive;


    if (online !== deviceOnline) {

        previousDeviceOnline =
            deviceOnline;

        deviceOnline =
            online;

        if (online) {

            updateConnection(
                true,
                "Device connected"
            );

        } else {

            updateConnection(
                false,
                "Device offline"
            );

            resetLiveTelemetry();
        }

    } else if (!online) {

        updateConnection(
            false,
            "Device offline"
        );
    }
}


/* =========================================================
   CONNECTION UI
========================================================= */

function updateConnection(
    online,
    message
) {

    const dot =
        document.getElementById(
            "connectionDot"
        );

    const status =
        document.getElementById(
            "deviceStatus"
        );

    const system =
        document.getElementById(
            "systemConnection"
        );

    const lastUpdate =
        document.getElementById(
            "lastUpdate"
        );


    if (online) {

        if (dot) {
            dot.className =
                "status-dot online";
        }

        if (status) {
            status.textContent =
                "ONLINE";
        }

        if (system) {
            system.textContent =
                "CONNECTED";
        }

        if (lastUpdate) {

            const age =
                lastGPSUpdate
                    ? Math.floor(
                        (
                            Date.now() -
                            lastGPSUpdate
                        ) / 1000
                    )
                    : 0;

            lastUpdate.textContent =
                age <= 1
                    ? "Live GPS connection"
                    : `Updated ${age}s ago`;
        }

    } else {

        if (dot) {
            dot.className =
                "status-dot offline";
        }

        if (status) {
            status.textContent =
                "OFFLINE";
        }

        if (system) {
            system.textContent =
                message ||
                "DISCONNECTED";
        }

        if (lastUpdate) {
            lastUpdate.textContent =
                "Device connection lost";
        }
    }
}


/* =========================================================
   RESET LIVE TELEMETRY
========================================================= */

function resetLiveTelemetry() {

    setText(
        "speedValue",
        "0.0"
    );

    setText(
        "telemetrySpeed",
        "0.0 km/h"
    );

    setText(
        "speedPercent",
        "0%"
    );

    setStyle(
        "speedBar",
        "width",
        "0%"
    );


    setText(
        "gpsQuality",
        "OFFLINE"
    );


    updateSatelliteBars(0);


    const marker =
        document.querySelector(
            ".vehicle-marker"
        );

    if (marker) {
        marker.classList.add(
            "offline"
        );
    }
}


/* =========================================================
   TIMESTAMP
========================================================= */

function getTimestamp(data) {

    if (!data) {
        return Date.now();
    }

    return normalizeTimestamp(
        data.timestamp
    );
}


function normalizeTimestamp(
    value
) {

    if (
        typeof value === "number" &&
        Number.isFinite(value)
    ) {

        return value < 100000000000
            ? value * 1000
            : value;
    }


    if (
        typeof value === "string"
    ) {

        const trimmed =
            value.trim();


        if (
            /^\d+(\.\d+)?$/.test(
                trimmed
            )
        ) {

            const number =
                Number(trimmed);

            return number < 100000000000
                ? number * 1000
                : number;
        }


        const parsed =
            Date.parse(trimmed);

        if (!Number.isNaN(parsed)) {
            return parsed;
        }
    }


    if (
        value &&
        typeof value === "object"
    ) {

        if (
            typeof value[".sv"] ===
            "number"
        ) {

            return normalizeTimestamp(
                value[".sv"]
            );
        }


        if (
            value[".sv"] ===
            "timestamp"
        ) {

            return Date.now();
        }
    }


    return Date.now();
}


/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(
    timestamp
) {

    if (!timestamp) {
        return "--";
    }

    return new Date(
        timestamp
    ).toLocaleTimeString(
        [],
        {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );
}


function formatDate(
    timestamp
) {

    if (!timestamp) {
        return "--";
    }

    return new Date(
        timestamp
    ).toLocaleString(
        [],
        {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit"
        }
    );
}


/* =========================================================
   HISTORY
========================================================= */

function updateHistory(data) {

    const table =
        document.getElementById(
            "historyTable"
        );

    const count =
        document.getElementById(
            "historyCount"
        );


    if (count) {
        count.textContent =
            data.length;
    }


    if (!table) {
        return;
    }


    if (!data.length) {

        table.innerHTML = `
            <tr>
                <td colspan="6" class="empty">
                    Waiting for GPS history...
                </td>
            </tr>
        `;

        return;
    }


    const latest =
        [...data]
            .reverse()
            .slice(0, 12);


    table.innerHTML =
        latest
            .map(
                (item, index) => `

                    <tr>

                        <td>
                            ${index + 1}
                        </td>

                        <td>
                            ${formatTime(
                                getTimestamp(item)
                            )}
                        </td>

                        <td>
                            ${Number(item.lat)
                                .toFixed(6)}
                        </td>

                        <td>
                            ${Number(item.lng)
                                .toFixed(6)}
                        </td>

                        <td class="speed">
                            ${Number(item.speed || 0)
                                .toFixed(1)}
                            km/h
                        </td>

                        <td>
                            ${Number(item.sats || 0)}
                        </td>

                    </tr>
                `
            )
            .join("");
}


/* =========================================================
   REPLAY MAP
========================================================= */

replayMap =
    L.map(
        "replayMap",
        {
            zoomControl: true,
            attributionControl: true
        }
    ).setView(
        DEFAULT_POSITION,
        13
    );


L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(replayMap);


/* ---------- Replay Full Route ---------- */

replayFullRoute =
    L.polyline(
        [],
        {
            color: "#526170",
            weight: 4,
            opacity: 0.35,
            dashArray: "7 9",
            smoothFactor: 1
        }
    ).addTo(replayMap);


/* ---------- Replay Active Route ---------- */

replayRoute =
    L.polyline(
        [],
        {
            color: "#65a9ff",
            weight: 5,
            opacity: 0.85,
            smoothFactor: 1
        }
    ).addTo(replayMap);


/* ---------- Replay Marker ---------- */

replayMarker =
    L.marker(
        DEFAULT_POSITION,
        {
            icon: vehicleIcon
        }
    ).addTo(replayMap);


setTimeout(
    () => replayMap.invalidateSize(),
    500
);


/* =========================================================
   DAILY REPLAY
========================================================= */

function updateDailyReplay(data) {

    const today =
        new Date();


    const startOfDay =
        new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate()
        ).getTime();


    const endOfDay =
        startOfDay +
        24 * 60 * 60 * 1000;


    replayData =
        data
            .filter(item => {

                const timestamp =
                    getTimestamp(item);

                return (
                    timestamp >= startOfDay &&
                    timestamp < endOfDay
                );
            })
            .sort(
                (a, b) =>
                    getTimestamp(a) -
                    getTimestamp(b)
            );


    stopReplay();

    replayIndex = 0;

    updateReplayStatistics();
    updateReplayMap();
    updateReplaySlider();


    if (replayData.length) {

        moveReplayMarker(0);

    } else {

        replayMarker.setLatLng(
            DEFAULT_POSITION
        );

        replayRoute.setLatLngs([]);
    }
}


/* =========================================================
   REPLAY STATISTICS
========================================================= */

function updateReplayStatistics() {

    const distanceElement =
        document.getElementById(
            "dailyDistance"
        );

    const pointsElement =
        document.getElementById(
            "dailyPoints"
        );


    if (!replayData.length) {

        if (distanceElement) {
            distanceElement.textContent =
                "0.00 km";
        }

        if (pointsElement) {
            pointsElement.textContent =
                "0";
        }

        return;
    }


    const distance =
        calculateReplayDistance(
            replayData
        );


    if (distanceElement) {

        distanceElement.textContent =
            `${distance.toFixed(2)} km`;
    }


    if (pointsElement) {

        pointsElement.textContent =
            replayData.length;
    }
}


function calculateReplayDistance(
    data
) {

    let total = 0;


    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        total +=
            calculateDistance(
                Number(data[i - 1].lat),
                Number(data[i - 1].lng),
                Number(data[i].lat),
                Number(data[i].lng)
            );
    }


    return total;
}


/* =========================================================
   REPLAY MAP UPDATE
========================================================= */

function updateReplayMap() {

    const points =
        replayData.map(
            item => [
                Number(item.lat),
                Number(item.lng)
            ]
        );


    replayFullRoute.setLatLngs(
        points
    );

    replayRoute.setLatLngs(
        points.length
            ? [points[0]]
            : []
    );


    if (!points.length) {
        return;
    }


    replayMap.fitBounds(
        replayFullRoute.getBounds(),
        {
            padding: [35, 35]
        }
    );
}


/* =========================================================
   REPLAY SLIDER
========================================================= */

function updateReplaySlider() {

    const slider =
        document.getElementById(
            "replaySlider"
        );


    if (!slider) {
        return;
    }


    slider.min = 0;

    slider.max =
        Math.max(
            replayData.length - 1,
            0
        );

    slider.value =
        replayIndex;


    updateReplayTime();
}


/* =========================================================
   REPLAY MARKER
========================================================= */

function moveReplayMarker(
    index
) {

    if (!replayData.length) {
        return;
    }


    index =
        Math.max(
            0,
            Math.min(
                index,
                replayData.length - 1
            )
        );


    replayIndex = index;


    const item =
        replayData[index];


    const lat =
        Number(item.lat);

    const lng =
        Number(item.lng);


    replayMarker.setLatLng([
        lat,
        lng
    ]);


    const traveled =
        replayData
            .slice(
                0,
                index + 1
            )
            .map(
                point => [
                    Number(point.lat),
                    Number(point.lng)
                ]
            );


    replayRoute.setLatLngs(
        traveled
    );


    replayMap.panTo(
        [lat, lng],
        {
            animate: true,
            duration: 0.25
        }
    );


    const slider =
        document.getElementById(
            "replaySlider"
        );


    if (slider) {
        slider.value = index;
    }


    updateReplayTime();
    updateJourneyInfo(item);
}


/* =========================================================
   REPLAY TIME
========================================================= */

function updateReplayTime() {

    const currentElement =
        document.getElementById(
            "replayCurrentTime"
        );

    const totalElement =
        document.getElementById(
            "replayTotalTime"
        );


    if (!replayData.length) {

        if (currentElement) {
            currentElement.textContent =
                "00:00:00";
        }

        if (totalElement) {
            totalElement.textContent =
                "00:00:00";
        }

        return;
    }


    const firstTimestamp =
        getTimestamp(
            replayData[0]
        );

    const currentTimestamp =
        getTimestamp(
            replayData[replayIndex]
        );

    const lastTimestamp =
        getTimestamp(
            replayData[
                replayData.length - 1
            ]
        );


    if (currentElement) {

        currentElement.textContent =
            formatDuration(
                Math.max(
                    0,
                    currentTimestamp -
                    firstTimestamp
                )
            );
    }


    if (totalElement) {

        totalElement.textContent =
            formatDuration(
                Math.max(
                    0,
                    lastTimestamp -
                    firstTimestamp
                )
            );
    }
}


function formatDuration(
    milliseconds
) {

    const totalSeconds =
        Math.floor(
            milliseconds / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;


    return [
        String(hours).padStart(2, "0"),
        String(minutes).padStart(2, "0"),
        String(seconds).padStart(2, "0")
    ].join(":");
}


/* =========================================================
   JOURNEY INFO
========================================================= */

function updateJourneyInfo(
    item
) {

    const startElement =
        document.getElementById(
            "journeyStart"
        );

    const currentElement =
        document.getElementById(
            "journeyCurrent"
        );


    if (
        startElement &&
        replayData.length
    ) {

        startElement.textContent =
            formatDate(
                getTimestamp(
                    replayData[0]
                )
            );
    }


    if (
        currentElement &&
        item
    ) {

        currentElement.textContent =
            formatDate(
                getTimestamp(item)
            );
    }
}


/* =========================================================
   REPLAY ENGINE
========================================================= */

function playReplay() {

    if (replayPlaying) {
        return;
    }


    if (replayData.length < 2) {
        return;
    }


    if (
        replayIndex >=
        replayData.length - 1
    ) {

        replayIndex = 0;

        moveReplayMarker(
            replayIndex
        );
    }


    replayPlaying = true;

    updatePlayButton();

    startReplaySegment();
}


function startReplaySegment() {

    if (!replayPlaying) {
        return;
    }


    if (
        replayIndex >=
        replayData.length - 1
    ) {

        stopReplay();

        return;
    }


    const current =
        replayData[
            replayIndex
        ];

    const next =
        replayData[
            replayIndex + 1
        ];


    replaySegmentFrom = [
        Number(current.lat),
        Number(current.lng)
    ];

    replaySegmentTo = [
        Number(next.lat),
        Number(next.lng)
    ];


    replaySegmentStart =
        performance.now();


    if (replayAnimationFrame) {

        cancelAnimationFrame(
            replayAnimationFrame
        );
    }


    replayAnimationFrame =
        requestAnimationFrame(
            animateReplaySegment
        );
}


function animateReplaySegment(
    now
) {

    if (!replayPlaying) {
        return;
    }


    const speedSelect =
        document.getElementById(
            "replaySpeed"
        );


    const duration =
        speedSelect
            ? Number(speedSelect.value)
            : 250;


    const progress =
        Math.min(
            (
                now -
                replaySegmentStart
            ) / duration,
            1
        );


    const eased =
        easeInOutCubic(progress);


    const lat =
        replaySegmentFrom[0] +
        (
            replaySegmentTo[0] -
            replaySegmentFrom[0]
        ) * eased;


    const lng =
        replaySegmentFrom[1] +
        (
            replaySegmentTo[1] -
            replaySegmentFrom[1]
        ) * eased;


    replayMarker.setLatLng([
        lat,
        lng
    ]);


    const traveled =
        replayData
            .slice(
                0,
                replayIndex + 1
            )
            .map(
                point => [
                    Number(point.lat),
                    Number(point.lng)
                ]
            );


    traveled.push([
        lat,
        lng
    ]);


    replayRoute.setLatLngs(
        traveled
    );


    if (progress < 1) {

        replayAnimationFrame =
            requestAnimationFrame(
                animateReplaySegment
            );

        return;
    }


    replayIndex++;

    updateReplaySlider();

    updateJourneyInfo(
        replayData[
            replayIndex
        ]
    );


    if (
        replayIndex >=
        replayData.length - 1
    ) {

        moveReplayMarker(
            replayIndex
        );

        stopReplay();

        return;
    }


    startReplaySegment();
}


function stopReplay() {

    replayPlaying = false;


    if (replayAnimationFrame) {

        cancelAnimationFrame(
            replayAnimationFrame
        );

        replayAnimationFrame = null;
    }


    updatePlayButton();
}


/* =========================================================
   PLAY BUTTON
========================================================= */

function updatePlayButton() {

    const button =
        document.getElementById(
            "replayPlayBtn"
        );


    if (!button) {
        return;
    }


    const icon =
        button.querySelector(
            ".control-icon"
        );

    const label =
        button.querySelector(
            ".control-label"
        );


    if (replayPlaying) {

        if (icon) {
            icon.textContent =
                "⏸";
        }

        if (label) {
            label.textContent =
                "PAUSE";
        }

    } else {

        if (icon) {
            icon.textContent =
                "▶";
        }

        if (label) {
            label.textContent =
                "PLAY";
        }
    }
}


/* =========================================================
   REPLAY NAVIGATION
========================================================= */

function goToReplayStart() {

    stopReplay();

    if (!replayData.length) {
        return;
    }

    moveReplayMarker(0);
}


function goToReplayEnd() {

    stopReplay();

    if (!replayData.length) {
        return;
    }

    moveReplayMarker(
        replayData.length - 1
    );
}


function replayBackward() {

    stopReplay();

    if (!replayData.length) {
        return;
    }

    moveReplayMarker(
        Math.max(
            replayIndex - 1,
            0
        )
    );
}


function replayForward() {

    stopReplay();

    if (!replayData.length) {
        return;
    }

    moveReplayMarker(
        Math.min(
            replayIndex + 1,
            replayData.length - 1
        )
    );
}


/* =========================================================
   REPLAY CONTROLS
========================================================= */

const replayPlayBtn =
    document.getElementById(
        "replayPlayBtn"
    );

if (replayPlayBtn) {

    replayPlayBtn.addEventListener(
        "click",
        () => {

            if (replayPlaying) {
                stopReplay();
            } else {
                playReplay();
            }
        }
    );
}


const replayStartBtn =
    document.getElementById(
        "replayStartBtn"
    );

if (replayStartBtn) {

    replayStartBtn.addEventListener(
        "click",
        goToReplayStart
    );
}


const replayBackBtn =
    document.getElementById(
        "replayBackBtn"
    );

if (replayBackBtn) {

    replayBackBtn.addEventListener(
        "click",
        replayBackward
    );
}


const replayForwardBtn =
    document.getElementById(
        "replayForwardBtn"
    );

if (replayForwardBtn) {

    replayForwardBtn.addEventListener(
        "click",
        replayForward
    );
}


const replayEndBtn =
    document.getElementById(
        "replayEndBtn"
    );

if (replayEndBtn) {

    replayEndBtn.addEventListener(
        "click",
        goToReplayEnd
    );
}


/* =========================================================
   SLIDER
========================================================= */

const replaySlider =
    document.getElementById(
        "replaySlider"
    );

if (replaySlider) {

    replaySlider.addEventListener(
        "input",
        () => {

            stopReplay();

            moveReplayMarker(
                Number(
                    replaySlider.value
                )
            );
        }
    );
}


/* =========================================================
   PLAYBACK SPEED
========================================================= */

const replaySpeed =
    document.getElementById(
        "replaySpeed"
    );

if (replaySpeed) {

    replaySpeed.addEventListener(
        "change",
        () => {

            if (replayPlaying) {

                if (
                    replayAnimationFrame
                ) {

                    cancelAnimationFrame(
                        replayAnimationFrame
                    );
                }

                startReplaySegment();
            }
        }
    );
}


/* =========================================================
   KEYBOARD SHORTCUTS
========================================================= */

document.addEventListener(
    "keydown",
    event => {

        const target =
            event.target;

        if (
            target &&
            (
                target.tagName === "INPUT" ||
                target.tagName === "SELECT" ||
                target.tagName === "TEXTAREA"
            )
        ) {
            return;
        }


        switch (event.key) {

            case " ":

                event.preventDefault();

                if (replayPlaying) {
                    stopReplay();
                } else {
                    playReplay();
                }

                break;


            case "ArrowLeft":

                event.preventDefault();

                replayBackward();

                break;


            case "ArrowRight":

                event.preventDefault();

                replayForward();

                break;


            case "Home":

                event.preventDefault();

                goToReplayStart();

                break;


            case "End":

                event.preventDefault();

                goToReplayEnd();

                break;
        }
    }
);


/* =========================================================
   CONNECTION MONITOR
========================================================= */

setInterval(
    () => {

        evaluateConnection();


        if (deviceOnline) {

            const age =
                lastGPSUpdate
                    ? Math.floor(
                        (
                            Date.now() -
                            lastGPSUpdate
                        ) / 1000
                    )
                    : 0;


            const lastUpdate =
                document.getElementById(
                    "lastUpdate"
                );


            if (
                lastUpdate &&
                age >= 0
            ) {

                lastUpdate.textContent =
                    age <= 1
                        ? "Live GPS connection"
                        : `Updated ${age}s ago`;
            }
        }

    },
    2000
);


/* =========================================================
   UTILITY
========================================================= */

function setText(
    id,
    value
) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent = value;
    }
}


function setStyle(
    id,
    property,
    value
) {

    const element =
        document.getElementById(id);

    if (element) {
        element.style[property] = value;
    }
}


function easeInOutCubic(
    value
) {

    return value < 0.5
        ? 4 * value ** 3
        : 1 -
          Math.pow(
              -2 * value + 2,
              3
          ) / 2;
}


/* =========================================================
   START
========================================================= */

startFirebase();