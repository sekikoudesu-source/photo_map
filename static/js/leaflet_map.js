// ==========================================
// 全局变量定义
// ==========================================
let isEditMode = false, secretPassword = "";
let markersDict = {};
let currentEditingMarkerId = null;
let map, clusterManager, tempClickedLat = null, tempClickedLng = null;

// ==========================================
// 【核心魔法】：无刷新更新 UI (SPA 的灵魂)
// ==========================================
function refreshUI() {
    if (clusterManager) clusterManager.clearLayers();
    markersDict = {};

    const listContainer = document.getElementById("marker-list");
    if(listContainer) listContainer.innerHTML = "";

    fetch("/api/get_markers",{
    headers: {
        "ngrok-skip-browser-warning": "true" // 这就是接头暗号，值随便写什么都行
    }}).then(res => res.json()).then(data => {
        data.forEach(item => {
            createMarker(item);
            if (listContainer) {
                const div = document.createElement("div");
                div.className = "list-item";
                div.innerHTML = `<h4>${item.name}</h4><p>${item.description}</p>`;
                div.onclick = () => {
                    map.flyTo([item.lat, item.lng], 16, { animate: true, duration: 1.5 });
                    setTimeout(() => {
                        const marker = markersDict[item.id];
                        if(marker) {
                            clusterManager.zoomToShowLayer(marker, () => {
                                marker.openPopup();
                            });
                        }
                    }, 1500);
                };
                listContainer.appendChild(div);
            }
        });
    });
}

// ==========================================
// 1. 收起/展开侧边栏核心逻辑
// ==========================================
function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    sidebar.classList.toggle("collapsed");
}

// ==========================================
// 2. 模式切换与验证逻辑 (带准星联动)
// ==========================================
async function toggleMode() {
    const modeBtn = document.getElementById("modeBtn");
    const smartBtn = document.getElementById("smartUploadBtn");
    const mapContainer = document.getElementById("map");

    if (isEditMode) {
        isEditMode = false;
        secretPassword = "";
        modeBtn.innerHTML = "👁️ 現在: 閲覧モード";
        modeBtn.style.backgroundColor = "#4CAF50";
        if (smartBtn) smartBtn.style.display = "none";
        mapContainer.classList.remove("crosshair-cursor-enabled");
    } else {
        const pwd = prompt("編集用パスワードを入力してください:");
        if (pwd) {
            try {
                const response = await fetch("/api/verify_password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pwd })
                });

                if (response.ok) {
                    secretPassword = pwd;
                    isEditMode = true;
                    modeBtn.innerHTML = "✏️ 現在: 編集モード";
                    modeBtn.style.backgroundColor = "#ff9800";
                    if (smartBtn) smartBtn.style.display = "block";
                    mapContainer.classList.add("crosshair-cursor-enabled");
                } else {
                    alert("❌ パスワードが正しくありません！");
                }
            } catch (error) {
                alert("サーバーとの通信に失敗しました！");
            }
        }
    }
}

// ==========================================
// 3. 追加单张照片逻辑
// ==========================================
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
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_base64: base64, password: secretPassword })
            })
            .then(res => res.json())
            .then(data => {
                const marker = markersDict[currentEditingMarkerId];
                if (marker && marker._item && marker._refreshPopup) {
                    marker._item.photos.push({ id: data.photo_id, base64: base64 });
                    marker._refreshPopup();
                }
            })
            .catch(err => alert("写真の追加に失敗しました！"));
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    });
}

// ==========================================
// 4. 删除逻辑 (SPA 无刷新重绘)
// ==========================================
window.deleteMarkerFromDB = function(markerId) {
    if(!confirm("このスポットと、含まれるすべての写真を削除してもよろしいですか？")) return;
    fetch("/api/delete_marker/" + markerId, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: secretPassword })
    })
    .then(res => {
        if(!res.ok) throw new Error("削除に失敗しました");
        refreshUI();
    }).catch(err => alert(err.message));
}

window.deletePhotoFromDB = function(photoId, markerId) {
    if(!confirm("この写真だけを削除してもよろしいですか？")) return;
    fetch("/api/delete_photo/" + photoId, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: secretPassword })
    })
    .then(res => {
        if(!res.ok) throw new Error("削除に失敗しました");
        const m = markersDict[markerId];
        if (m && m._item && m._refreshPopup) {
            m._item.photos = m._item.photos.filter(p => p.id !== photoId);
            m._refreshPopup();
        }
    }).catch(err => alert(err.message));
}

// ==========================================
// 5. 地图初始化与渲染核心
// ==========================================
function initMap() {
    map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([33.5902, 130.4017], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(map);

    clusterManager = L.markerClusterGroup();
    map.addLayer(clusterManager);

    refreshUI();
    bindAppendPhotoEvent();

    const fileInput = document.getElementById("photoUpload");
    map.on("click", (e) => {
        if (!isEditMode) return;
        tempClickedLat = e.latlng.lat;
        tempClickedLng = e.latlng.lng;
        fileInput.click();
    });

    fileInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            const localImageUrl = e.target.result;
            const newName = prompt("写真が読み込まれました！スポット名を入力してください:", "新しいスポット");
            if (!newName) return;
            const newDesc = prompt("スポットの簡単な説明を入力してください:", "思い出の記録");

            fetch("/api/add_marker", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    lat: tempClickedLat, lng: tempClickedLng, name: newName,
                    image_base64: localImageUrl, description: newDesc, password: secretPassword
                })
            })
            .then(res => res.json())
            .then(data => {
                alert("追加完了！");
                refreshUI();
            });
            fileInput.value = "";
        };
        reader.readAsDataURL(file);
    });
}

// ==========================================
// 6. 大头针与气泡渲染工厂
// ==========================================
function createMarker(item) {
    // 【魔法修改】：大头针视觉依然是 14x21，但在外面套了一个 34x41 的透明隐形方块
    const svgHtml = `
        <div style="width: 34px; height: 41px; display: flex; align-items: flex-end; justify-content: center; cursor: pointer;">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="14px" height="21px">
                <path d="M12 0C5.373 0 0 5.373 0 12c0 7.5 12 24 12 24s12-16.5 12-24c0-6.627-5.373-12-12-12z" 
                      fill="#947AB6" 
                      style="filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.3));" />
            </svg>
        </div>
    `;

    const pinIcon = L.divIcon({
        className: '',
        html: svgHtml,
        // 【关键】告诉地图引擎，现在这个按钮有 34x41 这么大！非常容易点中！
        iconSize: [34, 41],
        // 【重新计算锚点】X 是宽 34 的一半 (17)，Y 是总高 (41)，确保内部的针尖依然完美踩在坐标点上
        iconAnchor: [17, 41],
        // 气泡依然从针尖上方弹出
        popupAnchor: [0, -18]
    });

    const marker = L.marker([item.lat, item.lng], { icon: pinIcon });
    marker._item = item;

    function getPopupContent() {
        const photosHtml = marker._item.photos.map(p => {
            const delBtn = isEditMode ? `<button class="delete-photo-btn" onclick="deletePhotoFromDB(${p.id}, ${marker._item.id})" title="この写真を削除">✖</button>` : '';
            return `<div class="photo-item"><img src="${p.base64}">${delBtn}</div>`;
        }).join('');

        const btnsHtml = isEditMode ? `<div class="btn-group"><button class="btn add-photo-btn" onclick="triggerAddPhoto(${marker._item.id})">➕ 写真を追加</button><button class="btn delete-btn" onclick="deleteMarkerFromDB(${marker._item.id})">🗑️ スポット削除</button></div>` : '';
        return `<div class="info-window-content"><h3>${marker._item.name}</h3><div class="photo-gallery">${photosHtml}</div><p>${marker._item.description}</p>${btnsHtml}</div>`;
    }

    // 【修复冲突】直接绑定，不写 on('click')，让 Leaflet 全权接管点击开关动作
    marker.bindPopup(getPopupContent(), { maxWidth: 320 });

    // 刷新内容的接口保持不变
    marker._refreshPopup = function() { marker.setPopupContent(getPopupContent()); };
    markersDict[item.id] = marker;
    clusterManager.addLayer(marker);
}

// ==========================================
// 7. EXIF 智能照片 GPS 解析
// ==========================================
function convertDMSToDD(dmsArray, ref) {
    if (!dmsArray || dmsArray.length < 3) return null;
    let degrees = dmsArray[0].valueOf();
    let minutes = dmsArray[1].valueOf();
    let seconds = dmsArray[2].valueOf();
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    if (ref === "S" || ref === "W") { decimal = decimal * -1; }
    return decimal;
}

document.addEventListener("DOMContentLoaded", function() {
    const smartInput = document.getElementById('smartPhotoUpload');
    if(!smartInput) return;

    smartInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        EXIF.getData(file, function() {
            const latDMS = EXIF.getTag(this, "GPSLatitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef");
            const lngDMS = EXIF.getTag(this, "GPSLongitude");
            const lngRef = EXIF.getTag(this, "GPSLongitudeRef");

            if (latDMS && lngDMS) {
                const finalLat = convertDMSToDD(latDMS, latRef);
                const finalLng = convertDMSToDD(lngDMS, lngRef);

                alert("📍 位置情報を取得しました！(" + finalLat.toFixed(4) + ", " + finalLng.toFixed(4) + ")");

                const reader = new FileReader();
                reader.onload = function(evt) {
                    const localImageUrl = evt.target.result;
                    const newName = prompt("スポット名を入力してください:", "思い出の場所");
                    if (!newName) return;
                    const newDesc = prompt("簡単な説明:", "GPSから自動追加");

                    fetch("/api/add_marker", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            lat: finalLat, lng: finalLng, name: newName,
                            image_base64: localImageUrl, description: newDesc, password: secretPassword
                        })
                    })
                    .then(res => res.json())
                    .then(data => {
                        alert("✅ 追加完了！");
                        refreshUI();
                    });
                };
                reader.readAsDataURL(file);
            } else {
                alert("❌ この写真にはGPS(位置情報)が含まれていません。通常のクリック追加を使ってください。");
            }
        });
        e.target.value = '';
    });
});

// ==========================================
// 8. OpenStreetMap (Nominatim) 搜索功能
// ==========================================
function searchLocation() {
    const input = document.getElementById("searchInput");
    const query = input.value.trim();
    if (!query) return;

    const searchBtn = input.nextElementSibling;
    const originalText = searchBtn.innerHTML;
    searchBtn.innerHTML = "⏳";

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            searchBtn.innerHTML = originalText;

            if (data && data.length > 0) {
                const targetLat = parseFloat(data[0].lat);
                const targetLon = parseFloat(data[0].lon);
                map.flyTo([targetLat, targetLon], 16, { animate: true, duration: 2.0 });
            } else {
                alert("❌ 場所が見つかりませんでした。別のキーワード(英語や正式名称)を試してください。");
            }
        })
        .catch(err => {
            searchBtn.innerHTML = originalText;
            alert("通信エラーが発生しました。");
        });
}

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keypress", function (e) {
            if (e.key === "Enter") searchLocation();
        });
    }
});

window.onload = initMap;