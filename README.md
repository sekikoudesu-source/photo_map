# 🗺️ 思い出の軌跡 (Map Album)

A lightweight, modern, and high-performance Single Page Application (SPA) map album built with FastAPI and Leaflet. Bind your precious memories with precise geographic coordinates and create your own visual "Atlas of Moments".

---

## 🌟 Project Overview

This project is a high-fidelity, immersive full-stack personal map album system. Designed around a **Single Page Application (SPA)** architecture, the frontend discards heavy component frameworks in favor of pure, handcrafted HTML5, CSS3, and Vanilla JavaScript. The backend is powered by the asynchronous, high-performance **FastAPI** framework coupled with an embedded **SQLite3** database.

Going beyond basic geographic pin-mapping and photo management, this system features extensive optimization in visual presentation, data transfer efficiency, and hardware/network automation. It introduces a custom 3D physically-textured "Polaroid Wall" photo-stacking animation and seamlessly integrates client-side Canvas image compression, hardware-level EXIF satellite coordinate extraction, open-source reverse geocoding for zero-typing place naming, WebSocket full-duplex real-time synchronization, and automated Ngrok public tunneling. Whether deployed locally or hosted as a private cloud service, it offers an incredibly fluid, professional, and ritualistic user experience.

---

## ✨ Core Features & Technical Evolutions

### 1. 🖼️ High-Fidelity "Polaroid Wall" Physical Stacking
* **Realistic Tactile Aesthetics**: Photo cards are rendered as realistic Polaroid snapshots, utilizing subtle randomized rotation variables (`--tilt`) to appear organic. They feature complex stacked shadows (`box-shadow`) and a 135° soft-gloss overlay gradient (`.photo-sheen`).
* **Fan-Out Hover Effect**: Driven entirely by pure CSS transition matrices, hovering over a photo stack causes the underlying photos to dynamically spread out like a hand of cards, mimicking the tangible experience of flipping through physical photographs.
* **Cross-Location Overlap Protection**: An intelligent layer-elevation algorithm identifies when a single photo is clicked to be centered and enlarged (`scale(1.15)`). It instantly locates the parent Leaflet Popup container and forces its layer index (`z-index`) to `9999`, completely overpowering and overlaying any nearby overlapping pins.

### 2. ⚡ Physical Viewport Hard-Lock & Floating Drawer Layout
* **Absolute Viewport Lock**: The main container (`#app-container`) implements a strict full-screen structural lock (`100vh` / `100vw`, `overflow: hidden`), completely preventing unwanted global layout scrollbars across desktop and mobile browsers.
* **Suspended Timeline Drawer**: The left-hand timeline sidebar leverages an absolute-positioned floating drawer architecture controlled by a smooth `cubic-bezier(0.4, 0, 0.2, 1)` transition curve. Its toggle handle utilizes CSS pseudo-elements to automatically flip arrow indicators (`◀` / `▶`) based on layout states.
* **Contextual Cursor System**: A custom global mouse cursor (`my_cursor.png`) is mapped across all interactive maps and layers. Toggling the application into Edit Mode automatically mutates the pointer into a high-precision crosshair (`cursor: crosshair`), providing strong interactive feedback.

### 3. 📍 Smart EXIF Coordinate Extraction & Reverse Geocoding
* **Hardware-Level Extraction**: Integrated with the `exif-js` engine, the frontend directly reads raw EXIF metadata embedded in images taken by smartphones or digital cameras. It automatically captures `GPSLatitude` and `GPSLongitude` tags, converting Degrees/Minutes/Seconds (DMS) into standard Decimal Degrees (DD).
* **Zero-Input Automatic Place Naming**: Upon extracting valid satellite coordinates, the client dispatches an asynchronous reverse geocoding request to the OpenStreetMap Nominatim API. It extracts the closest contextual geographic node (such as landmarks `amenity`, neighborhoods `neighbourhood`, or towns/villages `suburb/town/village`) and pre-populates the location name field automatically, enabling a frictionless "upload-to-pinpoint" workflow.

### 4. 🚀 Client-Side Canvas Extreme Image Compression
* **Bandwidth & Storage Optimization**: Before multi-megabyte high-resolution image files leave the user's device, the frontend intercepts them using an HTML5 Canvas runtime. It calculates proportional downscaling (locking the maximum width to 1080px) and exports an 80%-quality-optimized `image/jpeg` Base64 data stream. This compresses individual files by over 90%, optimizing upload latency and drastically reducing server storage footprints.

### 5. 💎 Performance Overhaul: Slim JSON & 1-Year HTTP Strong Cache
* **Slim-Payload JSON API**: The communication pipeline has been heavily optimized. The core route `/api/get_markers` has been completely stripped of heavy image Base64 data. When initial map layers load, the frontend pulls a lightweight JSON tree containing only coordinate positions, location names, and photo IDs, boosting initial rendering speeds by orders of magnitude.
* **Dedicated Image Pipeline & Strong Caching**: Each photo asset is fetched individually through a dedicated streaming channel (`/api/image/{photo_id}`). The backend injects an immutable strong cache header (`Cache-Control: public, max-age=31536000, immutable`), instructing web browsers to lock image assets in local hardware storage for 1 full year (31,536,000 seconds), ensuring subsequent visits load instantly.
* **Dynamic Scale Synchronization**: The frontend dynamically calculates the map's current zoom level and mutates a CSS global variable `--photo-scale` (bound between 0.55x and 1.3x). At macro zoom levels (<11), a `.hide-polaroids` rule hides photo walls to maintain map clarity; when zooming into micro levels, a 150ms elastic buffer re-triggers DOM rendering to smoothly reveal the photos.

### 6. 🛡️ Asynchronous Architecture & Deadlock-Free Storage
* **SQLite3 WAL Mode Guard**: To prevent database locks or concurrent hanging errors during multi-client read/write operations, the backend initializes SQLite3 with Write-Ahead Logging (`PRAGMA journal_mode=WAL;`) alongside a 30-second busy timeout rule, significantly expanding concurrent data throughput.
* **SPA State-Preserving Re-rendering**: All CRUD actions (creating locations, appending photos, deleting places, or removing individual images) are handled asynchronously via standard Fetch requests marshaled by a centralized `refreshUI()` pipeline. This avoids full-page browser flashes, cleanly repainting the map while safely preserving active user session data and password validation states.

### 7. 🔄 WebSocket Full-Duplex Broadcast Hub
* **Multi-Client State Sync**: The backend features an ASGI-compliant `ConnectionManager` that handles persistent WebSocket long-connections. Whenever an administrative user adds a place, appends a photo, or deletes data, the server broadcasts a `"refresh"` primitive across the `/ws` tunnel to all active global clients, triggering invisible, instant UI re-draws.

### 8. 🌐 Automated Ngrok Public Tunneling
* **Instant HTTPS Deployment**: The system integrates `pyngrok` directly into its bootstrap sequence. Upon launching the server, the application automatically requests an encrypted public `https` tunnel from Ngrok and prints the dynamic URL straight to the terminal. This provides instant remote mobile access and fulfills modern browser requirements forcing HTTPS for geolocation and secure Fetch pipelines.
* **Seamless Warning Bypass**: Outbound frontend Fetch calls are pre-packaged with the custom `ngrok-skip-browser-warning` request header, completely bypassing Ngrok's free-tier anti-phishing landing page and guaranteeing clean, uninterrupted API streams.

---

## 🛠️ Tech Stack

* **Frontend:**
  * **Core Layout**: HTML5 / CSS3 (Absolute-positioned Overlay architecture, independent of heavy UI component libraries)
  * **Interactions**: Vanilla JavaScript (Modern asynchronous ES6+ streams and closure models)
  * **Map Engine**: [Leaflet.js 1.9.4](https://leafletjs.com/) (Lightweight map layers control)
  * **Cluster Optimization**: Leaflet.markercluster 1.4.1 (Sub-pixel marker aggregation algorithms)
  * **Metadata Extraction**: [EXIF-js](https://github.com/exif-js/exif-js) (Client-side hardware metadata parsing)
* **Backend:**
  * **Core Framework**: FastAPI (High-performance, ASGI-compliant asynchronous Python web framework)
  * **Real-Time Communication**: WebSockets (Full-duplex event broadcasting mesh)
  * **Tunneling Gateway**: Pyngrok (Automated secure public tunnel mapping)
  * **ASGI Server**: Uvicorn (Lightweight, concurrent production-grade web server)
* **Storage:**
  * **Database Engine**: SQLite3 (Embedded relational storage running under WAL log mode)

---

## 🚀 Quick Start

### 1. Environment Requirements
Ensure your host machine has **Python 3.8** or above installed.

### 2. Clone the Repository & Install Dependencies
```bash
git clone [https://github.com/your-username/map-album.git](https://github.com/your-username/map-album.git)
cd map-album
pip install fastapi uvicorn pyngrok pydantic jinja2
```

### 3. Create the Configuration File `config.json`
Create a file named `config.json` in the root directory of the project using the following layout:
```json
{
  "edit_password": "your_secure_password",
  "database": {
    "file_name": "map_photos.db"
  },
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "reload": false
  }
}
```

### 4. (Optional) Configure Your Ngrok Authtoken
To allow the automated public tunnel to start without session constraints, go to the [Ngrok Dashboard](https://dashboard.ngrok.com/) to fetch your Authtoken. Replace the placeholder string near line 311 in `main.py`:
```python
ngrok.set_auth_token("YOUR_REAL_NGROK_AUTHTOKEN")
```

### 5. Launch the Production ASGI Server
Run the following execution command in your terminal:
```bash
python main.py
```
Upon a successful bootstrap, the terminal console will output the following network tunnel data:
```text
⏳ 正在向 ngrok 申请公网隧道...

==================================================
🚀 公网访问地址已成功生成！
🌍 任何人都可以通过此链接访问: [https://xxxx-xxxx.ngrok-free.app](https://xxxx-xxxx.ngrok-free.app)
==================================================
```

### 6. Explore and Use the Platform
Open your browser and navigate to the local host address `http://localhost:8000` or the generated `ngrok` public domain.
* **Browsing Mode**: Entered by default. Users can safely click map markers, trigger the cascading fan-out Polaroid stacks, zoom in/out, and query places via the timeline floating drawer.
* **Editing & Pinning Mode**: Click the green **"👁️ 現在: 閲覧モード"** button on the top-right corner and provide your master password defined in `config.json`. Once verified, the interface updates to an orange **"✏️ 現在: 編集モード"** button. You can now add memories via two methods:
  1. **Manual Pinning**: Simply double-click (or single-click) anywhere on the map grid. A file selector will pop up. Upload a photo, enter a location name, and save.
  2. **Smart Satellite Tracking**: Click the purple **"📍 写真から自動で位置取得"** button that appears on the right. Upload an original picture containing GPS tags. The map will instantly fly to the correct geographic spot and automatically pre-fill the real-world address via the reverse geocoding engine.

---

## 📝 Developer Notes

* **Image Storage Strategies & Production Scaling**:
  To maintain a lightweight architecture and keep local setups simple, this project currently stores the compressed Base64 image data strings straight inside text fields inside the SQLite3 database (`map_photos.db`). Thanks to the **decoupled pipeline data architecture** and **strict 1-year immutable caching layer** implemented in this update, this setup delivers exceptional latency and loading metrics for private, individual, or small-team use.
  *If you intend to scale this system for large-scale commercial architectures, multi-user accounts, or high-frequency traffic, it is highly recommended to rewrite the upload backend to save binary streams into object storage buckets (e.g., AWS S3, Alibaba Cloud OSS) and store only the resulting static URL string paths inside the database fields.*
* **Session & Authentication Layer**:
  Session persistence and state rules rely completely on frontend application states coupled with backend cryptographic string checks. It does not issue stateful Session Cookies or distribute heavy JSON Web Tokens (JWT). This keeps the code small, fast, and secure for private instances. For multi-tenant isolation, consider integrating official OAuth2 and JWT middleware interceptors.

---

## 🤝 Contributing

We welcome all forms of community contributions! If you encounter an edge-case bug, have performance optimization ideas, or want to create even cooler 3D visual photo styles:
* Open an **Issue** to report bugs or request features.
* Submit a **Pull Request** to patch code directly.

---

## 💡 Credits

Special thanks to **Xu Xiaofan**, who proposed the original concept for this project and contributed invaluable artistic guidance to the interactive visual framework of the Polaroid stack UI.
