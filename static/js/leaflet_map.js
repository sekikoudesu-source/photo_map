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

function createMarker(item) {
    const pinIcon = L.divIcon({ className: 'custom-waterdrop-pin', iconSize: [8, 8], iconAnchor: [0, 0] });
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

    marker.on('click', function() { marker.bindPopup(getPopupContent(), { maxWidth: 320 }).openPopup(); });
    marker._refreshPopup = function() { marker.setPopupContent(getPopupContent()); };

    markersDict[item.id] = marker;
    clusterManager.addLayer(marker);
}

window.onload = initMap;