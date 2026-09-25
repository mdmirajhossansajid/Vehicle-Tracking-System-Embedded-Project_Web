/* =========================================================
   TRACKVISION
   Professional Vehicle Tracking Dashboard
   ESP32 + GP-02 GNSS + Firebase Realtime Database
========================================================= */


/* =========================================================
   FIREBASE
========================================================= */

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
    getDatabase,
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

import {
    getAuth,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const firebaseConfig = {

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


/* =========================================================
   INITIALIZE FIREBASE
========================================================= */

const app =
    initializeApp(firebaseConfig);

const database =
    getDatabase(app);

const auth =
    getAuth(app);


/* =========================================================
   GLOBAL VARIABLES
========================================================= */


/* ---------- Main Map ---------- */

let map;

let vehicleMarker;

let routeLine;

let routeVisible = true;


/* ---------- Firebase Data ---------- */

let historyData = [];

let latestGPS = null;

let lastFirebaseUpdate = 0;


/* ---------- Replay ---------- */

let replayMap;

let replayRoute;

let replayMarker;

let replayData = [];

let replayIndex = 0;

let replayTimer = null;

let replayPlaying = false;


/* =========================================================
   DEFAULT MAP POSITION
========================================================= */

const defaultPosition = [
    23.8103,
    90.4125
];


/* =========================================================
   MAIN MAP
========================================================= */

map = L.map(
    "map",
    {
        zoomControl: true,
        attributionControl: true
    }
).setView(
    defaultPosition,
    13
);


/* ---------- OpenStreetMap ---------- */

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,

        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(map);


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
   MAIN ROUTE
========================================================= */

routeLine = L.polyline(
    [],
    {
        color: "#66f2a5",

        weight: 4,

        opacity: 0.75,

        smoothFactor: 1
    }
).addTo(map);


/* =========================================================
   FIREBASE LOGIN
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


    /* =====================================================
       CURRENT GPS
    ===================================================== */

    const gpsRef =
        ref(
            database,
            "gps"
        );


    onValue(

        gpsRef,

        (snapshot) => {

            const data =
                snapshot.val();


            if (!data) {

                updateConnection(
                    false,
                    "No GPS data"
                );

                return;
            }


            latestGPS =
                data;


            lastFirebaseUpdate =
                Date.now();


            updateGPSDashboard(
                data
            );

        },

        (error) => {

            console.error(
                "GPS listener error:",
                error
            );

            updateConnection(
                false,
                "Database error"
            );

        }
    );


    /* =====================================================
       HISTORY
    ===================================================== */

    const historyRef =
        ref(
            database,
            "history"
        );


    onValue(

        historyRef,

        (snapshot) => {

            const data =
                snapshot.val();


            if (!data) {

                historyData = [];

                updateHistory([]);

                updateDailyReplay([]);

                return;
            }


            historyData =
                Object.entries(data)

                    .map(
                        ([id, value]) => ({
                            id,
                            ...value
                        })
                    )

                    .filter(
                        item =>

                            Number.isFinite(
                                Number(item.lat)
                            ) &&

                            Number.isFinite(
                                Number(item.lng)
                            )
                    )

                    .sort(
                        (a, b) =>
                            getTimestamp(a) -
                            getTimestamp(b)
                    );


            updateHistory(
                historyData
            );


            drawRoute(
                historyData
            );


            calculateStatistics(
                historyData
            );


            updateDailyReplay(
                historyData
            );

        },

        (error) => {

            console.error(
                "History listener error:",
                error
            );

        }
    );


    /* =====================================================
       HEARTBEAT
    ===================================================== */

    const heartbeatRef =
        ref(
            database,
            "status/heartbeat"
        );


    onValue(

        heartbeatRef,

        (snapshot) => {

            const heartbeat =
                snapshot.val();

            console.log(
                "ESP32 heartbeat:",
                heartbeat
            );

        }
    );
}


/* =========================================================
   GPS DASHBOARD UPDATE
========================================================= */

function updateGPSDashboard(
    data
) {

    const lat =
        Number(data.lat);

    const lng =
        Number(data.lng);

    const speed =
        Number(data.speed) || 0;

    const sats =
        Number(data.sats) || 0;


    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {

        return;
    }


    /* =====================================================
       SPEED
    ===================================================== */

    const speedValue =
        document.getElementById(
            "speedValue"
        );

    if (speedValue) {

        speedValue.textContent =
            speed.toFixed(1);
    }


    const telemetrySpeed =
        document.getElementById(
            "telemetrySpeed"
        );

    if (telemetrySpeed) {

        telemetrySpeed.textContent =
            `${speed.toFixed(1)} km/h`;
    }


    const speedPercent =
        Math.min(
            (speed / 120) * 100,
            100
        );


    const speedBar =
        document.getElementById(
            "speedBar"
        );

    if (speedBar) {

        speedBar.style.width =
            `${speedPercent}%`;
    }


    const speedPercentElement =
        document.getElementById(
            "speedPercent"
        );

    if (speedPercentElement) {

        speedPercentElement.textContent =
            `${Math.round(speedPercent)}%`;
    }


    /* =====================================================
       SATELLITES
    ===================================================== */

    const satelliteValue =
        document.getElementById(
            "satelliteValue"
        );

    if (satelliteValue) {

        satelliteValue.textContent =
            sats;
    }


    const telemetrySatellites =
        document.getElementById(
            "telemetrySatellites"
        );

    if (telemetrySatellites) {

        telemetrySatellites.textContent =
            sats;
    }


    updateSatelliteBars(
        sats
    );


    /* =====================================================
       COORDINATES
    ===================================================== */

    const latitude =
        document.getElementById(
            "latitude"
        );

    if (latitude) {

        latitude.textContent =
            lat.toFixed(6);
    }


    const longitude =
        document.getElementById(
            "longitude"
        );

    if (longitude) {

        longitude.textContent =
            lng.toFixed(6);
    }


    const mapCoordinates =
        document.getElementById(
            "mapCoordinates"
        );

    if (mapCoordinates) {

        mapCoordinates.textContent =
            `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    }


    /* =====================================================
       TIME
    ===================================================== */

    const timestamp =
        getTimestamp(data);


    const gpsTime =
        document.getElementById(
            "gpsTime"
        );

    if (gpsTime) {

        gpsTime.textContent =
            formatDate(timestamp);
    }


    const lastUpdate =
        document.getElementById(
            "lastUpdate"
        );

    if (lastUpdate) {

        lastUpdate.textContent =
            `Updated ${formatTime(timestamp)}`;
    }


    /* =====================================================
       CONNECTION
    ===================================================== */

    updateConnection(
        true,
        "GPS signal active"
    );


    /* =====================================================
       MAIN MAP
    ===================================================== */

    updateVehicleMarker(
        lat,
        lng,
        speed,
        sats
    );
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

    const position = [
        lat,
        lng
    ];


    if (!vehicleMarker) {

        vehicleMarker =
            L.marker(
                position,
                {
                    icon: vehicleIcon
                }
            )
            .addTo(map);


        vehicleMarker.bindPopup(
            createPopup(
                lat,
                lng,
                speed,
                sats
            )
        );


        map.setView(
            position,
            16
        );

    }

    else {

        vehicleMarker.setLatLng(
            position
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


    /* ---------- Smooth Pan ---------- */

    if (
        map.getZoom() >= 14
    ) {

        map.panTo(
            position,
            {
                animate: true,
                duration: .8
            }
        );
    }
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

        <div style="min-width:180px">

            <strong style="
                color:#66f2a5;
                font-size:12px;
            ">
                TRACKVISION
            </strong>

            <hr style="
                border:0;
                border-top:1px solid #29313b;
                margin:8px 0;
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

        </div>

    `;
}


/* =========================================================
   HISTORY TABLE
========================================================= */

function updateHistory(
    data
) {

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

                <td
                    colspan="6"
                    class="empty"
                >
                    Waiting for GPS history...
                </td>

            </tr>

        `;

        return;
    }


    /* ---------- Latest 12 ---------- */

    const latest =
        [...data]
            .reverse()
            .slice(
                0,
                12
            );


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
   DRAW MAIN ROUTE
========================================================= */

function drawRoute(
    data
) {

    const points =

        data

            .filter(
                item =>

                    Number.isFinite(
                        Number(item.lat)
                    ) &&

                    Number.isFinite(
                        Number(item.lng)
                    )
            )

            .map(
                item => [
                    Number(item.lat),
                    Number(item.lng)
                ]
            );


    routeLine.setLatLngs(
        points
    );
}


/* =========================================================
   STATISTICS
========================================================= */

function calculateStatistics(
    data
) {

    if (!data.length) {

        return;
    }


    /* =====================================================
       TOP SPEED
    ===================================================== */

    const topSpeed =

        Math.max(
            ...data.map(
                item =>
                    Number(item.speed) || 0
            )
        );


    const topSpeedElement =
        document.getElementById(
            "topSpeed"
        );


    if (topSpeedElement) {

        topSpeedElement.textContent =
            topSpeed.toFixed(1);
    }


    /* =====================================================
       DISTANCE
    ===================================================== */

    let totalDistance = 0;


    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        const previous =
            data[i - 1];

        const current =
            data[i];


        totalDistance +=

            calculateDistance(

                Number(previous.lat),

                Number(previous.lng),

                Number(current.lat),

                Number(current.lng)

            );
    }


    const distanceElement =
        document.getElementById(
            "distanceValue"
        );


    if (distanceElement) {

        distanceElement.textContent =
            totalDistance.toFixed(2);
    }
}


/* =========================================================
   HAVERSINE DISTANCE
========================================================= */

function calculateDistance(
    lat1,
    lon1,
    lat2,
    lon2
) {

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

        Math.sin(
            dLat / 2
        ) ** 2 +

        Math.cos(
            degreesToRadians(lat1)
        ) *

        Math.cos(
            degreesToRadians(lat2)
        ) *

        Math.sin(
            dLon / 2
        ) ** 2;


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

    return degrees *
        Math.PI /
        180;
}


/* =========================================================
   SATELLITE BARS
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
                satellites,
                0
            ),
            8
        );


    bars.forEach(
        (bar, index) => {

            if (
                index < active
            ) {

                bar.style.background =
                    "#66f2a5";

                bar.style.boxShadow =
                    "0 0 7px rgba(102,242,165,.5)";

            }

            else {

                bar.style.background =
                    "#26313d";

                bar.style.boxShadow =
                    "none";
            }

        }
    );


    const quality =
        document.getElementById(
            "gpsQuality"
        );


    if (!quality) {

        return;
    }


    if (satellites >= 8) {

        quality.textContent =
            "EXCELLENT";

    }

    else if (satellites >= 5) {

        quality.textContent =
            "GOOD";

    }

    else if (satellites >= 4) {

        quality.textContent =
            "FAIR";

    }

    else {

        quality.textContent =
            "WEAK";
    }
}


/* =========================================================
   CONNECTION STATUS
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

    }

    else {

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
    }
}


/* =========================================================
   TIMESTAMP
========================================================= */

function getTimestamp(
    data
) {

    if (!data) {

        return Date.now();
    }


    const timestamp =
        data.timestamp;


    if (
        typeof timestamp ===
        "number"
    ) {

        return timestamp;
    }


    if (
        typeof timestamp ===
        "string"
    ) {

        const parsed =
            Date.parse(
                timestamp
            );


        if (
            !Number.isNaN(parsed)
        ) {

            return parsed;
        }
    }


    if (
        timestamp &&
        typeof timestamp ===
        "object"
    ) {

        if (
            typeof timestamp[".sv"] ===
            "number"
        ) {

            return timestamp[".sv"];
        }
    }


    return Date.now();
}


/* =========================================================
   FORMAT TIME
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
   CENTER MAP BUTTON
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


            const position = [

                Number(
                    latestGPS.lat
                ),

                Number(
                    latestGPS.lng
                )

            ];


            map.setView(
                position,
                16,
                {
                    animate: true
                }
            );

        }
    );
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

            if (routeVisible) {

                map.removeLayer(
                    routeLine
                );

                routeVisible = false;

            }

            else {

                routeLine.addTo(
                    map
                );

                routeVisible = true;
            }

        }
    );
}


/* =========================================================
   DAILY TRIP REPLAY MAP
========================================================= */

replayMap =
    L.map(
        "replayMap",
        {
            zoomControl: true,

            attributionControl: true
        }
    )
    .setView(
        defaultPosition,
        13
    );


/* ---------- Replay Tiles ---------- */

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,

        attribution:
            "&copy; OpenStreetMap contributors"
    }
).addTo(
    replayMap
);


/* =========================================================
   REPLAY ROUTE
========================================================= */

replayRoute =
    L.polyline(
        [],
        {
            color: "#65a9ff",

            weight: 5,

            opacity: 0.75,

            smoothFactor: 1
        }
    ).addTo(
        replayMap
    );


/* =========================================================
   REPLAY MARKER
========================================================= */

replayMarker =
    L.marker(
        defaultPosition,
        {
            icon: vehicleIcon
        }
    ).addTo(
        replayMap
    );


/* =========================================================
   DAILY REPLAY
========================================================= */

function updateDailyReplay(
    data
) {

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


    /* =====================================================
       FILTER TODAY'S DATA
    ===================================================== */

    replayData =

        data

            .filter(
                item => {

                    const timestamp =
                        getTimestamp(item);

                    return (
                        timestamp >= startOfDay &&
                        timestamp < endOfDay
                    );

                }
            )

            .sort(
                (a, b) =>
                    getTimestamp(a) -
                    getTimestamp(b)
            );


    /* =====================================================
       RESET REPLAY
    ===================================================== */

    stopReplay();

    replayIndex = 0;


    /* =====================================================
       STATISTICS
    ===================================================== */

    updateReplayStatistics();


    /* =====================================================
       DRAW ROUTE
    ===================================================== */

    updateReplayMap();


    /* =====================================================
       SLIDER
    ===================================================== */

    updateReplaySlider();


    /* =====================================================
       MARKER
    ===================================================== */

    if (
        replayData.length
    ) {

        moveReplayMarker(
            0
        );

    }

    else {

        replayMarker.setLatLng(
            defaultPosition
        );

        replayRoute.setLatLngs(
            []
        );
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


/* =========================================================
   REPLAY DISTANCE
========================================================= */

function calculateReplayDistance(
    data
) {

    let total =
        0;


    for (
        let i = 1;
        i < data.length;
        i++
    ) {

        total +=

            calculateDistance(

                Number(
                    data[i - 1].lat
                ),

                Number(
                    data[i - 1].lng
                ),

                Number(
                    data[i].lat
                ),

                Number(
                    data[i].lng
                )

            );
    }


    return total;
}


/* =========================================================
   UPDATE REPLAY MAP
========================================================= */

function updateReplayMap() {

    const points =

        replayData.map(
            item => [

                Number(item.lat),

                Number(item.lng)

            ]
        );


    replayRoute.setLatLngs(
        points
    );


    if (!points.length) {

        return;
    }


    replayMap.fitBounds(
        replayRoute.getBounds(),
        {
            padding: [
                30,
                30
            ]
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


    slider.min =
        0;


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
   MOVE REPLAY MARKER
========================================================= */

function moveReplayMarker(
    index
) {

    if (
        !replayData.length
    ) {

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


    replayIndex =
        index;


    const item =
        replayData[index];


    const lat =
        Number(item.lat);

    const lng =
        Number(item.lng);


    replayMarker.setLatLng(
        [
            lat,
            lng
        ]
    );


    /* ---------- Show route until current point ---------- */

    const traveledPoints =

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
        traveledPoints
    );


    /* ---------- Center marker ---------- */

    replayMap.panTo(
        [
            lat,
            lng
        ],
        {
            animate: true,

            duration: .3
        }
    );


    /* ---------- Slider ---------- */

    const slider =
        document.getElementById(
            "replaySlider"
        );


    if (slider) {

        slider.value =
            index;
    }


    updateReplayTime();

    updateJourneyInfo(
        item
    );
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


    if (
        !replayData.length
    ) {

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
            replayData[
                replayIndex
            ]
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


/* =========================================================
   FORMAT DURATION
========================================================= */

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

        String(hours)
            .padStart(2, "0"),

        String(minutes)
            .padStart(2, "0"),

        String(seconds)
            .padStart(2, "0")

    ].join(":");
}


/* =========================================================
   JOURNEY INFORMATION
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
   PLAY REPLAY
========================================================= */

function playReplay() {

    if (
        replayPlaying
    ) {

        return;
    }


    if (
        replayData.length < 2
    ) {

        return;
    }


    /* If replay reached end, start again */

    if (
        replayIndex >=
        replayData.length - 1
    ) {

        replayIndex = 0;

        moveReplayMarker(
            replayIndex
        );
    }


    replayPlaying =
        true;


    updatePlayButton();


    runReplayStep();
}


/* =========================================================
   REPLAY STEP
========================================================= */

function runReplayStep() {

    if (
        !replayPlaying
    ) {

        return;
    }


    if (
        replayIndex >=
        replayData.length - 1
    ) {

        stopReplay();

        return;
    }


    replayIndex++;


    moveReplayMarker(
        replayIndex
    );


    const speedSelect =
        document.getElementById(
            "replaySpeed"
        );


    const delay =
        speedSelect
            ? Number(
                speedSelect.value
            )
            : 250;


    replayTimer =
        setTimeout(
            runReplayStep,
            delay
        );
}


/* =========================================================
   STOP REPLAY
========================================================= */

function stopReplay() {

    replayPlaying =
        false;


    if (replayTimer) {

        clearTimeout(
            replayTimer
        );

        replayTimer =
            null;
    }


    updatePlayButton();
}


/* =========================================================
   PLAY BUTTON UI
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

    }

    else {

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
   START REPLAY
========================================================= */

function goToReplayStart() {

    stopReplay();


    if (
        !replayData.length
    ) {

        return;
    }


    moveReplayMarker(
        0
    );
}


/* =========================================================
   END REPLAY
========================================================= */

function goToReplayEnd() {

    stopReplay();


    if (
        !replayData.length
    ) {

        return;
    }


    moveReplayMarker(
        replayData.length - 1
    );
}


/* =========================================================
   BACK
========================================================= */

function replayBackward() {

    stopReplay();


    if (
        !replayData.length
    ) {

        return;
    }


    const newIndex =
        Math.max(
            replayIndex - 1,
            0
        );


    moveReplayMarker(
        newIndex
    );
}


/* =========================================================
   FORWARD
========================================================= */

function replayForward() {

    stopReplay();


    if (
        !replayData.length
    ) {

        return;
    }


    const newIndex =
        Math.min(
            replayIndex + 1,
            replayData.length - 1
        );


    moveReplayMarker(
        newIndex
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

            }

            else {

                playReplay();
            }

        }
    );
}


/* ---------- START ---------- */

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


/* ---------- BACK ---------- */

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


/* ---------- FORWARD ---------- */

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


/* ---------- END ---------- */

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
   REPLAY SLIDER EVENT
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


            const index =
                Number(
                    replaySlider.value
                );


            moveReplayMarker(
                index
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

            if (
                replayPlaying
            ) {

                if (replayTimer) {

                    clearTimeout(
                        replayTimer
                    );
                }

                runReplayStep();
            }

        }
    );
}


/* =========================================================
   OFFLINE CHECK
========================================================= */

setInterval(

    () => {

        if (
            lastFirebaseUpdate === 0
        ) {

            return;
        }


        const elapsed =
            Date.now() -
            lastFirebaseUpdate;


        /* ---------- 10 Seconds ---------- */

        if (
            elapsed > 10000
        ) {

            updateConnection(
                false,
                "No recent GPS update"
            );
        }

    },

    3000
);


/* =========================================================
   START APPLICATION
========================================================= */

startFirebase();