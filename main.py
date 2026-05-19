import json
import sqlite3
import uvicorn
import webbrowser
import threading
import sys
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# --- 1. 設定の読み込み ---
with open("config.json", "r", encoding="utf-8") as f:
    config = json.load(f)

DB_FILE = config["database"]["file_name"]
EDIT_PASSWORD = config["edit_password"]
MAP_PROVIDER = config.get("map_provider", "leaflet").lower()
GOOGLE_API_KEY = config.get("google_maps_api_key", "")

app = FastAPI()

# --- 2. データベースの初期化 ---
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS markers(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            description TEXT,
            image_base64 TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            marker_id INTEGER NOT NULL,
            image_base64 TEXT NOT NULL,
            FOREIGN KEY (marker_id) REFERENCES markers (id) ON DELETE CASCADE
        )
    ''')

    try:
        cursor.execute("SELECT id, image_base64 FROM markers")
        rows = cursor.fetchall()
        for row in rows:
            marker_id = row[0]
            img = row[1]
            if img and img.strip() != "":
                cursor.execute("SELECT id FROM photos WHERE marker_id = ? AND image_base64 = ?", (marker_id, img))
                if not cursor.fetchone():
                    cursor.execute("INSERT INTO photos (marker_id, image_base64) VALUES (?, ?)", (marker_id, img))
        cursor.execute("UPDATE markers SET image_base64 = '' WHERE image_base64 != ''")
    except Exception:
        pass

    conn.commit()
    conn.close()

init_db()

# --- 3. データモデル ---
class MarkerData(BaseModel):
    name: str
    lat: float
    lng: float
    description: str
    image_base64: str
    password: str

class AddPhotoData(BaseModel):
    image_base64: str
    password: str

class PasswordData(BaseModel):
    password: str

# --- 4. API エンドポイント ---
@app.post("/api/verify_password")
def verify_password(data: PasswordData):
    if data.password == EDIT_PASSWORD:
        return {"status": "success"}
    else:
        raise HTTPException(status_code=403, detail="パスワードが正しくありません")

@app.post("/api/add_marker")
def add_marker(data: MarkerData):
    if data.password != EDIT_PASSWORD:
        raise HTTPException(status_code=403, detail="パスワードが違います。追加権限がありません。")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO markers (name, lat, lng, description, image_base64) VALUES (?, ?, ?, ?, '')",
        (data.name, data.lat, data.lng, data.description)
    )
    new_marker_id = cursor.lastrowid
    cursor.execute(
        "INSERT INTO photos (marker_id, image_base64) VALUES (?, ?)",
        (new_marker_id, data.image_base64)
    )
    new_photo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"status": "success", "id": new_marker_id, "photo_id": new_photo_id}

@app.post("/api/add_photo/{marker_id}")
def add_photo(marker_id: int, data: AddPhotoData):
    if data.password != EDIT_PASSWORD:
        raise HTTPException(status_code=403, detail="パスワードが違います。写真を追加する権限がありません。")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("INSERT INTO photos (marker_id, image_base64) VALUES (?, ?)", (marker_id, data.image_base64))
    new_photo_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return {"status": "success", "photo_id": new_photo_id}

@app.delete("/api/delete_marker/{marker_id}")
def delete_marker(marker_id: int, data: PasswordData):
    if data.password != EDIT_PASSWORD:
        raise HTTPException(status_code=403, detail="パスワードが違います。削除権限がありません。")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM photos WHERE marker_id = ?", (marker_id,))
    cursor.execute("DELETE FROM markers WHERE id = ?", (marker_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

# 【新增】删除单张照片的 API
@app.delete("/api/delete_photo/{photo_id}")
def delete_photo(photo_id: int, data: PasswordData):
    if data.password != EDIT_PASSWORD:
        raise HTTPException(status_code=403, detail="パスワードが違います。削除権限がありません。")

    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
    conn.commit()
    conn.close()
    return {"status": "success"}

@app.get("/api/get_markers")
def get_markers():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, lat, lng, description FROM markers")
    markers = cursor.fetchall()

    result = []
    for row in markers:
        marker_id = row[0]
        cursor.execute("SELECT id, image_base64 FROM photos WHERE marker_id = ?", (marker_id,))
        photos = [{"id": p[0], "base64": p[1]} for p in cursor.fetchall()]
        result.append({
            "id": marker_id,
            "name": row[1],
            "lat": row[2],
            "lng": row[3],
            "description": row[4],
            "photos": photos
        })
    conn.close()
    return result

# ==========================================
# --- 5. 完全独立 HTML テンプレート (Leaflet版) ---
# ==========================================
LEAFLET_HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>マイ・マップアルバム (Leaflet版)</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.4.1/dist/MarkerCluster.Default.css" />
    <script src="https://unpkg.com/leaflet.markercluster@1.4.1/dist/leaflet.markercluster.js"></script>
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
        #map { height: 100%; width: 100%; }
        .info-window-content { text-align: center; max-width: 280px; }
        .info-window-content h3 { margin: 5px 0; font-size: 16px; color: #75162D; }
        .info-window-content p { font-size: 13px; color: #666; margin: 5px 0 10px 0; }

        .photo-gallery { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 5px; margin-bottom: 5px; scroll-behavior: smooth; }
        .photo-gallery::-webkit-scrollbar { height: 6px; }
        .photo-gallery::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }

        /* 【新增】单张照片的容器与删除按钮 CSS */
        .photo-item { position: relative; flex-shrink: 0; }
        .photo-item img { height: 140px; width: auto; max-width: 220px; object-fit: cover; border-radius: 6px; display: block; box-shadow: 0 2px 4px rgba(0,0,0,0.15); background-color: #f7f3e8; }
        .delete-photo-btn { position: absolute; top: 4px; right: 4px; background: rgba(255,0,0,0.85); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3); padding: 0; line-height: 1; }
        .delete-photo-btn:hover { background: #ff0000; transform: scale(1.1); }

        .btn-group { display: flex; gap: 8px; margin-top: 10px; }
        .btn { flex: 1; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; font-size: 12px; }
        .add-photo-btn { background-color: #947AB6; } 
        .delete-btn { background-color: #ff4d4d; }
        #modeBtn { position: absolute; top: 20px; right: 20px; z-index: 1000; padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        .custom-waterdrop-pin { width: 8px; height: 8px; background-color: #947AB6; border-radius: 100% 100% 0 100%; transform: rotate(-45deg); margin-left: -4px; margin-top: -8px; box-shadow: -1px 1px 3px rgba(0,0,0,0.3); }
    </style>
</head>
<body>
    <button id="modeBtn" onclick="toggleMode()">👁️ 現在: 閲覧モード</button>
    <div id="map"></div>
    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
    <input type="file" id="appendPhotoUpload" accept="image/*" style="display: none;">

    <script>
        let isEditMode = false, secretPassword = "", markersDict = {};
        let currentEditingMarkerId = null; 
        let map, clusterManager, tempClickedLat = null, tempClickedLng = null;

        async function toggleMode() {
            if (isEditMode) {
                isEditMode = false; secretPassword = "";
                document.getElementById("modeBtn").innerHTML = "👁️ 現在: 閲覧モード";
                document.getElementById("modeBtn").style.backgroundColor = "#4CAF50";
            } else {
                const pwd = prompt("編集用パスワードを入力してください:");
                if (pwd) {
                    try {
                        const response = await fetch("/api/verify_password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) });
                        if (response.ok) {
                            secretPassword = pwd; isEditMode = true;
                            document.getElementById("modeBtn").innerHTML = "✏️ 現在: 編集モード";
                            document.getElementById("modeBtn").style.backgroundColor = "#ff9800";
                        } else { alert("❌ パスワードが正しくありません！"); }
                    } catch (error) { alert("サーバーとの通信に失敗しました！"); }
                }
            }
        }

        window.triggerAddPhoto = function(markerId) {
            currentEditingMarkerId = markerId;
            document.getElementById("appendPhotoUpload").click();
        };

        function bindAppendPhotoEvent() {
            document.getElementById("appendPhotoUpload").addEventListener("change", function(event) {
                const file = event.target.files[0];
                if (!file || !currentEditingMarkerId) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const base64 = e.target.result;
                    fetch("/api/add_photo/" + currentEditingMarkerId, { 
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_base64: base64, password: secretPassword }) 
                    }).then(res => res.json()).then(data => {
                        const marker = markersDict[currentEditingMarkerId];
                        if (marker && marker._item && marker._refreshPopup) { 
                            marker._item.photos.push({ id: data.photo_id, base64: base64 });
                            marker._refreshPopup(); 
                        }
                    }).catch(err => alert("写真の追加に失敗しました！"));
                };
                reader.readAsDataURL(file);
                event.target.value = ''; 
            });
        }

        function initMap() {
            map = L.map('map', { zoomControl: true, doubleClickZoom: false }).setView([33.5902, 130.4017], 12); 
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap &copy; CARTO' }).addTo(map);
            clusterManager = L.markerClusterGroup();
            map.addLayer(clusterManager);

            fetch("/api/get_markers").then(res => res.json()).then(data => {
                data.forEach(item => createMarker(item));
            });

            bindAppendPhotoEvent(); 

            const fileInput = document.getElementById("photoUpload");
            map.on("click", (e) => {
                if (!isEditMode) return; 
                tempClickedLat = e.latlng.lat; tempClickedLng = e.latlng.lng; fileInput.click(); 
            });

            fileInput.addEventListener("change", function(event) {
                const file = event.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const localImageUrl = e.target.result; 
                    const newName = prompt("写真が読み込まれました！スポット名を入力してください:", "新しいスポット"); if (!newName) return; 
                    const newDesc = prompt("スポットの簡単な説明を入力してください:", "思い出の記録");

                    fetch("/api/add_marker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: tempClickedLat, lng: tempClickedLng, name: newName, image_base64: localImageUrl, description: newDesc, password: secretPassword }) })
                    .then(res => res.json()).then(data => {
                        createMarker({ id: data.id, lat: tempClickedLat, lng: tempClickedLng, name: newName, description: newDesc, photos: [{ id: data.photo_id, base64: localImageUrl }] });
                    });
                    fileInput.value = ""; 
                };
                reader.readAsDataURL(file);
            });
        }

        window.deleteMarkerFromDB = function(markerId) {
            if(!confirm("このスポットと、含まれるすべての写真を削除してもよろしいですか？")) return;
            fetch("/api/delete_marker/" + markerId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: secretPassword }) })
            .then(res => {
                if(!res.ok) throw new Error("削除に失敗しました");
                const m = markersDict[markerId];
                if (m) { clusterManager.removeLayer(m); delete markersDict[markerId]; }
            }).catch(err => alert(err.message));
        }

        // 【新增】单图删除逻辑
        window.deletePhotoFromDB = function(photoId, markerId) {
            if(!confirm("この写真だけを削除してもよろしいですか？")) return;
            fetch("/api/delete_photo/" + photoId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: secretPassword }) })
            .then(res => {
                if(!res.ok) throw new Error("削除に失敗しました");
                const m = markersDict[markerId];
                if (m && m._item && m._refreshPopup) {
                    // 从当前地点的临时数据中过滤掉这张照片
                    m._item.photos = m._item.photos.filter(p => p.id !== photoId);
                    m._refreshPopup(); // 瞬间重绘弹窗
                }
            }).catch(err => alert(err.message));
        }

        function createMarker(item) {
            const pinIcon = L.divIcon({ className: 'custom-waterdrop-pin', iconSize: [8, 8], iconAnchor: [0, 0] });
            const marker = L.marker([item.lat, item.lng], { icon: pinIcon });
            marker._item = item; // 将数据挂载到 marker 实例上

            function getPopupContent() {
                // 生成多图，如果处于编辑模式，追加【✖】按钮
                const photosHtml = marker._item.photos.map(p => {
                    const delBtn = isEditMode ? '<button class="delete-photo-btn" onclick="deletePhotoFromDB(' + p.id + ', ' + marker._item.id + ')" title="この写真を削除">✖</button>' : '';
                    return '<div class="photo-item"><img src="' + p.base64 + '">' + delBtn + '</div>';
                }).join('');

                const btnsHtml = isEditMode ? '<div class="btn-group"><button class="btn add-photo-btn" onclick="triggerAddPhoto(' + marker._item.id + ')">➕ 写真を追加</button><button class="btn delete-btn" onclick="deleteMarkerFromDB(' + marker._item.id + ')">🗑️ スポット削除</button></div>' : '';
                return '<div class="info-window-content"><h3>' + marker._item.name + '</h3><div class="photo-gallery">' + photosHtml + '</div><p>' + marker._item.description + '</p>' + btnsHtml + '</div>';
            }

            marker.on('click', function() { marker.bindPopup(getPopupContent(), { maxWidth: 320 }).openPopup(); });
            marker._refreshPopup = function() { marker.setPopupContent(getPopupContent()); };

            markersDict[item.id] = marker;
            clusterManager.addLayer(marker);
        }
        window.onload = initMap;
    </script>
</body>
</html>
"""

# ==========================================
# --- 6. 完全独立 HTML テンプレート (Google版) ---
# ==========================================
GOOGLE_HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>マイ・マップアルバム (Google Maps版)</title>
    <script src="https://unpkg.com/@googlemaps/markerclusterer/dist/index.min.js"></script>
    <style>
        body, html { height: 100%; margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
        #map { height: 100%; width: 100%; }
        .info-window-content { text-align: center; max-width: 280px; }
        .info-window-content h3 { margin: 5px 0; font-size: 16px; color: #75162D; }
        .info-window-content p { font-size: 13px; color: #666; margin: 5px 0 10px 0; }

        .photo-gallery { display: flex; overflow-x: auto; gap: 8px; padding-bottom: 5px; margin-bottom: 5px; scroll-behavior: smooth; }
        .photo-gallery::-webkit-scrollbar { height: 6px; }
        .photo-gallery::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }

        /* 【新增】单张照片的容器与删除按钮 CSS */
        .photo-item { position: relative; flex-shrink: 0; }
        .photo-item img { height: 140px; width: auto; max-width: 220px; object-fit: cover; border-radius: 6px; display: block; box-shadow: 0 2px 4px rgba(0,0,0,0.15); background-color: #f7f3e8; }
        .delete-photo-btn { position: absolute; top: 4px; right: 4px; background: rgba(255,0,0,0.85); color: white; border: none; border-radius: 50%; width: 22px; height: 22px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 3px rgba(0,0,0,0.3); padding: 0; line-height: 1; }
        .delete-photo-btn:hover { background: #ff0000; transform: scale(1.1); }

        .btn-group { display: flex; gap: 8px; margin-top: 10px; }
        .btn { flex: 1; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; color: white; font-weight: bold; font-size: 12px; }
        .add-photo-btn { background-color: #947AB6; } 
        .delete-btn { background-color: #ff4d4d; }
        #modeBtn { position: absolute; top: 20px; right: 20px; z-index: 1000; padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; box-shadow: 0 2px 5px rgba(0,0,0,0.3); }
        .custom-waterdrop-pin { width: 8px; height: 8px; background-color: #947AB6; border-radius: 100% 100% 0 100%; transform: rotate(-45deg); margin-left: -4px; margin-top: -8px; box-shadow: -1px 1px 3px rgba(0,0,0,0.3); }
    </style>
</head>
<body>
    <button id="modeBtn" onclick="toggleMode()">👁️ 現在: 閲覧モード</button>
    <div id="map"></div>
    <input type="file" id="photoUpload" accept="image/*" style="display: none;">
    <input type="file" id="appendPhotoUpload" accept="image/*" style="display: none;">

    <script>
        let isEditMode = false, secretPassword = "", markersDict = {};
        let currentEditingMarkerId = null; 
        let map, activeInfoWindow = null, clusterManager = null, tempClickedLat = null, tempClickedLng = null;

        async function toggleMode() {
            if (isEditMode) {
                isEditMode = false; secretPassword = "";
                document.getElementById("modeBtn").innerHTML = "👁️ 現在: 閲覧モード";
                document.getElementById("modeBtn").style.backgroundColor = "#4CAF50";
                if(activeInfoWindow) activeInfoWindow.close();
            } else {
                const pwd = prompt("編集用パスワードを入力してください:");
                if (pwd) {
                    try {
                        const response = await fetch("/api/verify_password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pwd }) });
                        if (response.ok) {
                            secretPassword = pwd; isEditMode = true;
                            document.getElementById("modeBtn").innerHTML = "✏️ 現在: 編集モード";
                            document.getElementById("modeBtn").style.backgroundColor = "#ff9800";
                        } else { alert("❌ パスワードが正しくありません！"); }
                    } catch (error) { alert("サーバーとの通信に失敗しました！"); }
                }
            }
        }

        window.triggerAddPhoto = function(markerId) {
            currentEditingMarkerId = markerId;
            document.getElementById("appendPhotoUpload").click();
        };

        function bindAppendPhotoEvent() {
            document.getElementById("appendPhotoUpload").addEventListener("change", function(event) {
                const file = event.target.files[0];
                if (!file || !currentEditingMarkerId) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const base64 = e.target.result;
                    fetch("/api/add_photo/" + currentEditingMarkerId, { 
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_base64: base64, password: secretPassword }) 
                    }).then(res => res.json()).then(data => {
                        const marker = markersDict[currentEditingMarkerId];
                        if (marker && marker._item && marker._refreshPopup) { 
                            marker._item.photos.push({ id: data.photo_id, base64: base64 });
                            marker._refreshPopup(); 
                        }
                    }).catch(err => alert("写真の追加に失敗しました！"));
                };
                reader.readAsDataURL(file);
                event.target.value = ''; 
            });
        }

        function initMap() {
            const purplePinIcon = {
                path: "M 0,0 C -5,-10 -10,-15 -10,-20 C -10,-25.5 -5.5,-30 0,-30 C 5.5,-30 10,-25.5 10,-20 C 10,-15 5,-10 0,0 Z",
                fillColor: "#947AB6", fillOpacity: 1, strokeWeight: 0, scale: 0.8, anchor: new google.maps.Point(0, 0), 
            };

            map = new google.maps.Map(document.getElementById("map"), {
                center: { lat: 33.5902, lng: 130.4017 }, zoom: 12, disableDoubleClickZoom: true,
                styles: [
                    { elementType: "geometry", stylers: [{ color: "#f7f3e8" }] },
                    { elementType: "labels.text.stroke", stylers: [{ color: "#f7f3e8" }] },
                    { elementType: "labels.text.fill", stylers: [{ color: "#75162D" }] },
                    { featureType: "water", elementType: "geometry", stylers: [{ color: "#aedff7" }] },
                    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#75162D" }] },
                    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#d1e7dd" }] },
                    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#75162D" }] },
                    { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#f3c7d6" }] },
                    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#f3c7d6" }] },
                    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#75162D" }] },
                    { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#eae3d7" }] },
                    { featureType: "road.local", elementType: "geometry.stroke", stylers: [{ color: "#eae3d7" }] },
                    { featureType: "road.local", elementType: "labels.text.fill", stylers: [{ color: "#75162D" }] },
                    { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
                    { featureType: "transit", elementType: "labels", stylers: [{ visibility: "off" }] }
                ]
            });

            fetch("/api/get_markers").then(res => res.json()).then(data => {
                const fetchedMarkers = []; 
                data.forEach(item => { fetchedMarkers.push(createMarker(item, purplePinIcon)); });
                clusterManager = new markerClusterer.MarkerClusterer({ map: map, markers: fetchedMarkers });
            });

            bindAppendPhotoEvent();

            const fileInput = document.getElementById("photoUpload");
            map.addListener("click", (mapsMouseEvent) => {
                if (!isEditMode) return; 
                tempClickedLat = mapsMouseEvent.latLng.lat(); tempClickedLng = mapsMouseEvent.latLng.lng(); fileInput.click(); 
            });

            fileInput.addEventListener("change", function(event) {
                const file = event.target.files[0]; if (!file) return;
                const reader = new FileReader();
                reader.onload = function(e) {
                    const localImageUrl = e.target.result; 
                    const newName = prompt("写真が読み込まれました！スポット名を入力してください:", "新しいスポット"); if (!newName) return; 
                    const newDesc = prompt("スポットの簡単な説明を入力してください:", "思い出の記録");

                    fetch("/api/add_marker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: tempClickedLat, lng: tempClickedLng, name: newName, image_base64: localImageUrl, description: newDesc, password: secretPassword }) })
                    .then(res => res.json()).then(data => {
                        const newMarker = createMarker({ id: data.id, lat: tempClickedLat, lng: tempClickedLng, name: newName, description: newDesc, photos: [{ id: data.photo_id, base64: localImageUrl }] }, purplePinIcon);
                        if (clusterManager) clusterManager.addMarker(newMarker);
                    });
                    fileInput.value = ""; 
                };
                reader.readAsDataURL(file);
            });
        }

        window.deleteMarkerFromDB = function(markerId) {
            if(!confirm("このスポットと、含まれる所有的写真を削除してもよろしいですか？")) return;
            fetch("/api/delete_marker/" + markerId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: secretPassword }) })
            .then(res => {
                if(!res.ok) throw new Error("削除に失敗しました");
                const m = markersDict[markerId];
                if (m) { if (clusterManager) clusterManager.removeMarker(m); m.setMap(null); delete markersDict[markerId]; }
                if (activeInfoWindow) activeInfoWindow.close();
            }).catch(err => alert(err.message));
        }

        // 【新增】单图删除逻辑
        window.deletePhotoFromDB = function(photoId, markerId) {
            if(!confirm("この写真だけを削除してもよろしいですか？")) return;
            fetch("/api/delete_photo/" + photoId, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: secretPassword }) })
            .then(res => {
                if(!res.ok) throw new Error("削除に失敗しました");
                const m = markersDict[markerId];
                if (m && m._item && m._refreshPopup) {
                    m._item.photos = m._item.photos.filter(p => p.id !== photoId);
                    m._refreshPopup(); 
                }
            }).catch(err => alert(err.message));
        }

        function createMarker(item, iconSettings) {
            const marker = new google.maps.Marker({ position: { lat: item.lat, lng: item.lng }, animation: google.maps.Animation.DROP, icon: iconSettings });
            marker._item = item;

            function getPopupContent() {
                const photosHtml = marker._item.photos.map(p => {
                    const delBtn = isEditMode ? '<button class="delete-photo-btn" onclick="deletePhotoFromDB(' + p.id + ', ' + marker._item.id + ')" title="この写真を削除">✖</button>' : '';
                    return '<div class="photo-item"><img src="' + p.base64 + '">' + delBtn + '</div>';
                }).join('');

                const btnsHtml = isEditMode ? '<div class="btn-group"><button class="btn add-photo-btn" onclick="triggerAddPhoto(' + marker._item.id + ')">➕ 写真を追加</button><button class="btn delete-btn" onclick="deleteMarkerFromDB(' + marker._item.id + ')">🗑️ スポット削除</button></div>' : '';
                return '<div class="info-window-content"><h3>' + marker._item.name + '</h3><div class="photo-gallery">' + photosHtml + '</div><p>' + marker._item.description + '</p>' + btnsHtml + '</div>';
            }

            marker.addListener("click", () => {
                if (activeInfoWindow) activeInfoWindow.close();
                const infoWindow = new google.maps.InfoWindow({ content: getPopupContent(), maxWidth: 320 });
                infoWindow.open({ anchor: marker, map: map, shouldFocus: false });
                activeInfoWindow = infoWindow;
                marker._activeInfoWindow = infoWindow;
            });

            marker._refreshPopup = function() {
                if (marker._activeInfoWindow) { marker._activeInfoWindow.setContent(getPopupContent()); }
            };

            markersDict[item.id] = marker;
            return marker;
        }
    </script>
    <script async defer src="https://maps.googleapis.com/maps/api/js?key=REPLACE_ME_API_KEY&callback=initMap"></script>
</body>
</html>
"""

# --- 7. ルーティング分発 (只保留一行最安全的 API Key 替换) ---
@app.get("/")
def get_html():
    if MAP_PROVIDER == "google":
        return HTMLResponse(content=GOOGLE_HTML_TEMPLATE.replace("REPLACE_ME_API_KEY", GOOGLE_API_KEY))
    else:
        return HTMLResponse(content=LEAFLET_HTML_TEMPLATE)

# --- 8. ランチャー ---
if __name__ == "__main__":
    host = config["server"]["host"]
    port = config["server"]["port"]
    url = f"http://{'127.0.0.1' if host == '0.0.0.0' else host}:{port}"

    print(f"🚀 サーバーを起動中... 自動的にブラウザを開きます: {url}")
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()

    is_frozen = getattr(sys, 'frozen', False)
    reload_flag = False if is_frozen else config["server"]["reload"]

    if reload_flag:
        uvicorn.run("main:app", host=host, port=port, reload=True)
    else:
        uvicorn.run(app, host=host, port=port, reload=False)