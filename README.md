# 🗺️ 思い出の軌跡 (Map Album)

A lightweight, modern, and high-performance Single Page Application (SPA) map album built with FastAPI and Leaflet. Bind your precious memories with precise geographic coordinates and create your own visual "Atlas of Moments".

## 🌟 Project Overview

This project provides a clean, elegant, and frictionless interface to catalog your travels and memories. Through a complete architectural overhaul, the platform has been upgraded to a **Single Page Application (SPA)** framework. It features an advanced full-screen map layout integrated with an overlaying floating drawer, real-time UI re-rendering without page refreshes, client-side EXIF GPS parsing, and open-source reverse geocoding capabilities.

## ✨ Core Features

* **🗺️ Immersive Full-Screen Layout & Floating Drawer**
    * Abandoned rigid Flexbox structures for an absolute positioned `Overlay` model.
    * Ultra-smooth sidebar slide animations with an interactive "handle" that dynamically switches arrow directions (`◀` / `▶`) via pure CSS pseudo-elements.
* **⚡ SPA Re-rendering Engine (No Refreshes)**
    * All CRUD actions (adding/deleting locations and appending photos) are handled completely asynchronously via AJAX.
    * The centralized `refreshUI()` pipeline wipes and re-draws markers and sidebars instantly, ensuring that application state (such as Password validation and `isEditMode`) is never lost to a brute-force `location.reload()`.
* **📍 Smart EXIF GPS Extraction**
    * Built-in JavaScript client-side parsing of photo EXIF metadata. Automatically extracts geographic tags and converts Degrees/Minutes/Seconds (DMS) into Decimal Degrees (DD), offering a magical "upload to pinpoint" workflow.
* **🔍 Free Open-Source Location Search**
    * Seamlessly integrated with the OpenStreetMap (Nominatim) API via a centered, floating capsule search bar. Supports multi-language lookups (English, Japanese, Chinese, etc.) paired with Leaflet's native smooth `flyTo` flight animations.
* **🎯 Pixel-Perfect UX Optimizations**
    * **Invisible Hitbox Expansion**: Keeps the map visual crisp with tiny 14x21 SVG pin designs while expanding the physical interaction hitbox to 34x41 pixels. This completely eliminates misclicks, jitter, and click-through bugs on high-resolution screens.
    * **Dynamic Contextual Cursor**: Switching to "Edit Mode" automatically changes the map wrapper class pointer to a precision crosshair (`cursor: crosshair !important`), providing strong visual feedback to the user.
    * **Event Decoupling**: Completely fixed the classic Leaflet bug where custom pin `click` events clashed with the underlying native Popup engine, rendering second-clicks unresponsive.
* **🛡️ Ngrok Anti-Interception Header**
    * Front-end Fetch calls automatically bundle the `ngrok-skip-browser-warning` request header, bypassing Ngrok's free-tier anti-phishing landing page and guaranteeing clean API data streams.

## 🛠️ Tech Stack

* **Frontend:**
    * HTML5 / CSS3 (Pure native code, zero heavyweight component frameworks)
    * Vanilla JavaScript (ES6+ Asynchronous architecture)
    * [Leaflet.js](https://leafletjs.com/) (Core Map Engine)
    * Leaflet MarkerCluster (Performance Optimization: Smart Pin Clustering)
    * [EXIF-js](https://github.com/exif-js/exif-js) (Client-side metadata extraction)
* **Backend:**
    * Python 3.8+
    * FastAPI (High-performance, asynchronous Web API framework)
    * Uvicorn (ASGI production server)
* **Database:**
    * SQLite3 (Lightweight embedded storage)

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have Python 3.8 or above installed on your local system.

### 2. Clone and Install Dependencies
~~~bash
git clone https://github.com/your-username/map-album.git
cd map-album
pip install fastapi uvicorn
~~~

### 3. Spin Up the Development Server
~~~bash
uvicorn main:app --reload
~~~

### 4. Access the Platform
Open your favorite web browser and navigate to: `http://localhost:8000`

> **Note on Editing:** Click the green **"👁️ 現在: 閲覧モード"** button on the top right and enter your master password to toggle Edit Mode.

## 📁 Architecture & Directory Structure

~~~text
.
├── main.py                 # FastAPI backend, routing, and SQLite CRUD transactions
├── templates/
│   └── leaflet.html        # Single Page Application HTML skeleton & CDN imports
└── static/
    ├── css/
    │   └── style.css       # Layout overrides, overlay drawer mechanics, and animations
    └── js/
        └── leaflet_map.js  # Map initializers, asynchronous Fetch pipelines, and UI factories
~~~

## 📝 Developer Notes

* **Image Storage Strategy**: For structural simplicity, this project currently converts uploaded photos into base64 data strings and houses them directly inside text fields in the SQLite database (`map_photos.db`). If scaling for production environments or managing heavy high-resolution workloads, it is highly recommended to refactor the endpoints to pipe raw images directly to a local disk or cloud bucket (OSS/S3), storing only the respective file paths in the database.
* **Authentication Layer**: The current status of user sessions relies entirely on client-side state variables. It does not write Session Cookies or use Web Tokens (JWT). This makes it beautifully lightweight and perfectly secure for localized deployments or private tunnels, but should be strengthened if opened up to multi-user public registration.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! 
Feel free to check the issues page.


## 💡 Credits

A special thanks to **Xu Xiaofan**, who proposed the original idea for this project and contributed to its elegant visual design concepts.
