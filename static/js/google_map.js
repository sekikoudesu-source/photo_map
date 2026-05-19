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
            const delBtn = isEditMode ? `<button class="delete-photo-btn" onclick="deletePhotoFromDB(${p.id}, ${marker._item.id})" title="この写真を削除">✖</button>` : '';
            return `<div class="photo-item"><img src="${p.base64}">${delBtn}</div>`;
        }).join('');

        const btnsHtml = isEditMode ? `<div class="btn-group"><button class="btn add-photo-btn" onclick="triggerAddPhoto(${marker._item.id})">➕ 写真を追加</button><button class="btn delete-btn" onclick="deleteMarkerFromDB(${marker._item.id})">🗑️ スポット削除</button></div>` : '';
        return `<div class="info-window-content"><h3>${marker._item.name}</h3><div class="photo-gallery">${photosHtml}</div><p>${marker._item.description}</p>${btnsHtml}</div>`;
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