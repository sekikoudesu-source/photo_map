// ==========================================
// 全局响应式状态变量定义
// ==========================================
let isEditMode = false, secretPassword = "";
let markersDict = {};
let map, clusterManager, tempClickedLat = null, tempClickedLng = null;
let currentEditingMarkerId = null;
let refreshTimer = null;

// ==========================================
// 🚀 前端 Canvas 极速图片压缩引擎
// ==========================================
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            const MAX_WIDTH = 1080;
            if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);

            callback(compressedBase64);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// ==========================================
// 🚀 动态地图缩放比例计算器 (修复零尺寸黑洞)
// ==========================================
function updateMapScale() {
    if (!map) return;
    const currentZoom = map.getZoom();

    const BASE_ZOOM = 14;
    let scale = 1 + (currentZoom - BASE_ZOOM) * 0.15;
    if (scale > 1.3) scale = 1.3;
    if (scale < 0.55) scale = 0.55;

    map.getContainer().style.setProperty('--photo-scale', scale);

    const container = map.getContainer();
    if (currentZoom < 11) {
        container.classList.add("hide-polaroids");
    } else {
        container.classList.remove("hide-polaroids");
        // ⚡ 核心修复一：延迟 150 毫秒，等浏览器 DOM 完全恢复物理尺寸后，强制重新唤醒所有可见相纸
        setTimeout(() => {
            Object.values(markersDict).forEach(marker => {
                if (map.hasLayer(marker) && !marker.isPopupOpen()) {
                    marker.openPopup();
                }
            });
        }, 150);
    }
}

// ==========================================
// 1. 无刷新重绘与视图层渲染核心引擎
// ==========================================
function refreshUI() {
    if (refreshTimer) clearTimeout(refreshTimer);

    refreshTimer = setTimeout(() => {
        if (clusterManager) clusterManager.clearLayers();
        markersDict = {};
        const listContainer = document.getElementById("marker-list");
        if(listContainer) listContainer.innerHTML = "";

        fetch("/api/get_markers", { headers: { "ngrok-skip-browser-warning": "true" } })
        .then(res => {
            if (!res.ok) throw new Error("数据库连接受阻或挂起");
            return res.json();
        })
        .then(data => {
            if (!Array.isArray(data)) return;
            data.forEach(item => {
                createMarker(item);
                if (listContainer) {
                    const div = document.createElement("div");
                    div.className = "list-item";
                    div.innerHTML = `<h4>${item.name || '未命名地点'}</h4><p>${item.description || ''}</p>`;

                    div.onclick = () => {
                        const marker = markersDict[item.id];
                        if (marker) {
                            map.flyTo([item.lat, item.lng], 16, { animate: true, duration: 1.5 });
                            setTimeout(() => {
                                clusterManager.zoomToShowLayer(marker, () => {
                                    if (!marker.isPopupOpen()) marker.openPopup();
                                });
                            }, 1600);
                        }
                    };
                    listContainer.appendChild(div);
                }
            });
        })
        .catch(err => console.error("SPA 渲染引擎捕获到异常:", err));
    }, 100);
}

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("collapsed");
}

async function toggleMode() {
    const modeBtn = document.getElementById("modeBtn");
    const smartBtn = document.getElementById("smartUploadBtn");

    if (isEditMode) {
        isEditMode = false; secretPassword = "";
        modeBtn.innerHTML = "👁️ 現在: 閲覧モード"; modeBtn.style.backgroundColor = "#4CAF50";
        if (smartBtn) smartBtn.style.display = "none";
        refreshUI();
    } else {
        const pwd = prompt("編集用パスワードを入力してください:");
        if (pwd) {
            try {
                const response = await fetch("/api/verify_password", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ password: pwd })
                });
                if (response.ok) {
                    secretPassword = pwd; isEditMode = true;
                    modeBtn.innerHTML = "✏️ 現在: 編集モード"; modeBtn.style.backgroundColor = "#ff9800";
                    if (smartBtn) smartBtn.style.display = "block";
                    refreshUI();
                } else { alert("❌ パスワードが正しくありません！"); }
            } catch (error) { alert("服务器功能未就绪，请检查后台连接状态！"); }
        }
    }
}

// ==========================================
// 2. 异步 CRUD 数据通道
// ==========================================
window.triggerAddPhoto = function(markerId) {
    currentEditingMarkerId = markerId;
    document.getElementById("appendPhotoUpload").click();
};

function bindEvents() {
    document.getElementById("appendPhotoUpload").addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (!file || !currentEditingMarkerId) return;

        compressImage(file, function(compressedBase64) {
            fetch("/api/add_photo/" + currentEditingMarkerId, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image_base64: compressedBase64, password: secretPassword })
            })
            .then(res => {
                if(!res.ok) throw new Error("追加失败");
                refreshUI();
            })
            .catch(err => alert(err.message));
        });
        event.target.value = '';
    });
    document.addEventListener('click', function() {
        // 寻找所有目前正处于“拎出放大（front）”状态的卡片
        const activeCards = document.querySelectorAll('.polaroid-card.front');
        activeCards.forEach(card => {
            card.classList.remove('front'); // 撤销放大摆正

            // 顺便把它的弹窗层级也降回普通状态
            const parentPopup = card.closest('.leaflet-popup');
            if (parentPopup) {
                parentPopup.style.removeProperty('z-index');
            }
        });
    });
}

window.deleteMarkerFromDB = function(markerId) {
    if(!confirm("スポットと写真をすべて削除しますか？")) return;
    fetch("/api/delete_marker/" + markerId, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: secretPassword })
    }).then(() => refreshUI());
}

window.deletePhotoFromDB = function(photoId) {
    if(!confirm("この写真だけを削除しますか？")) return;
    fetch("/api/delete_photo/" + photoId, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: secretPassword })
    }).then(() => refreshUI());
}

// ==========================================
// 点击卡片切换放大摆正状态，并解决跨地点遮挡问题
// ==========================================
window.bringPhotoToFront = function(event, cardElement) {
    event.stopPropagation(); // 📌 斩断冒泡，拒绝穿透到地图引发乱打点

    // 1. 处理单张照片在自己地点内部的置顶逻辑
    if (cardElement.classList.contains('front')) {
        cardElement.classList.remove('front');
    } else {
        const currentStack = cardElement.parentNode;
        const allCards = currentStack.querySelectorAll('.polaroid-card');
        allCards.forEach(card => card.classList.remove('front'));
        cardElement.classList.add('front');

        // 🚀 2. 核心新增：跨地点遮挡处理逻辑！
        // 向上寻找包裹着这组照片的 Leaflet 原生弹窗最外层容器
        const parentPopup = cardElement.closest('.leaflet-popup');
        if (parentPopup) {
            // 先把地图上所有其他打开的地点的层级重置回默认值
            document.querySelectorAll('.leaflet-popup').forEach(popup => {
                popup.style.zIndex = '';
            });
            // 强行把当前点击的这个地点容器拉高到最顶层，彻底碾压隔壁的地点
            parentPopup.style.zIndex = '9999';
        }
    }
};

// ==========================================
// 3. 拍立得高保真钉墙组件装配
// ==========================================
function createMarker(item) {
    const customLegendHtml = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="24px" height="24px">
            <circle cx="16" cy="16" r="13" fill="#947AB6" stroke="#ffffff" stroke-width="2.5" style="filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.4));"/>
            <circle cx="16" cy="16" r="5" fill="#ffffff" />
        </svg>
    `;
    const customIcon = L.divIcon({ className: 'custom-map-legend', html: customLegendHtml, iconSize: [24, 24], iconAnchor: [12, 24] });
    const marker = L.marker([item.lat, item.lng], { icon: customIcon });
    marker._item = item;

    marker.on('click', () => {
        if (map.getZoom() < 11) {
            map.flyTo([item.lat, item.lng], 14, { animate: true, duration: 1.0 });
        } else {
            // ⚡ 核心修复二：兜底保障。如果在大视野下（>=11级）相纸不知为何被关掉了
            // 只要你点击底下的紫色双圈图例，强制呼出对应地点的相纸墙！
            if (!marker.isPopupOpen()) {
                marker.openPopup();
            }
        }
    });

    marker.on('popupopen', () => {
        if (marker._icon) marker._icon.classList.add('popup-open');
    });
    marker.on('popupclose', () => {
        if (marker._icon) marker._icon.classList.remove('popup-open');
    });

    function getPopupContent() {
        const photos = marker._item.photos || [];
        const photosHtml = photos.map((p, index) => {
            const tilt = (index % 2 === 0 ? 1 : -1) * (index * 4 + 5);
            const delBtn = isEditMode ? `<button class="delete-photo-btn" onclick="event.stopPropagation(); deletePhotoFromDB(${p.id})">✖</button>` : '';

            // 已移除默认的 front 状态，确保默认全是静置交错的
            return `
                <div class="polaroid-card" style="--tilt: ${tilt}deg; z-index: ${index};" onclick="bringPhotoToFront(event, this)">
                    <div class="polaroid-photo-wrapper">
                        <img src="/api/image/${p.id}" loading="lazy"><div class="photo-sheen"></div>${delBtn}
                    </div>
                    <div class="polaroid-caption">${index === photos.length - 1 ? marker._item.name : ''}</div>
                </div>
            `;
        }).join('');

        const bntBarHtml = isEditMode ? `
            <div class="stack-controls">
                <button class="btn add-photo-btn" onclick="event.stopPropagation(); triggerAddPhoto(${marker._item.id})">➕ 写真追加</button>
                <button class="btn delete-btn" onclick="event.stopPropagation(); deleteMarkerFromDB(${marker._item.id})">🗑️ 地点削除</button>
            </div>
        ` : '';

        return `<div class="polaroid-stack"><div class="stack-pin"></div><div class="cards-container">${photosHtml}</div>${bntBarHtml}</div>`;
    }

    marker.bindPopup(getPopupContent(), { autoClose: false, closeOnClick: false, className: 'polaroid-popup', popupAnchor: [0, 0] });
    markersDict[item.id] = marker;
    clusterManager.addLayer(marker);

    setTimeout(() => {
        if (map.hasLayer(marker) && !marker.isPopupOpen() && map.getZoom() >= 11) {
            marker.openPopup();
        }
    }, 200);
}

// ==========================================
// 4. 地址搜索与定位
// ==========================================
function searchLocation() {
    const input = document.getElementById("searchInput");
    const query = input.value.trim();
    if (!query) return;
    const searchBtn = input.nextElementSibling;
    const originalText = searchBtn.innerHTML; searchBtn.innerHTML = "⏳";

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
            searchBtn.innerHTML = originalText;
            if (data && data.length > 0) map.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 16, { animate: true, duration: 2.0 });
            else alert("❌ 場所が見つかりませんでした。");
        }).catch(() => { searchBtn.innerHTML = originalText; alert("通信エラーが発生しました。"); });
}

function convertDMSToDD(dmsArray, ref) {
    if (!dmsArray || dmsArray.length < 3) return null;
    let decimal = Number(dmsArray[0]) + (Number(dmsArray[1]) / 60) + (Number(dmsArray[2]) / 3600);
    if (ref === "S" || ref === "W") decimal = decimal * -1;
    return decimal;
}

// ==========================================
// 5. 地图初始化与长连接
// ==========================================
function initMap() {
    map = L.map('map', { zoomControl: false, doubleClickZoom: false }).setView([33.5902, 130.4017], 14);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);

    clusterManager = L.markerClusterGroup({ showCoverageOnHover: false });

    clusterManager.on('layeradd', function (e) {
        const marker = e.layer;
        setTimeout(() => {
            if (marker.getPopup() && !marker.isPopupOpen() && map.getZoom() >= 11) {
                marker.openPopup();
            }
        }, 100);
    });
    map.addLayer(clusterManager);

    map.on("zoom", updateMapScale);
    map.on("zoomend", updateMapScale);

    updateMapScale();
    refreshUI();
    bindEvents();

    const fileInput = document.getElementById("photoUpload");
    map.on("click", (e) => {
        // 1. 先检查当前有没有被放大的照片
        const activeFrontCards = document.querySelectorAll('.polaroid-card.front');
        if (activeFrontCards.length > 0) {
            // 如果有，只负责收起照片，并直接 return 阻断后续的打点逻辑
            activeFrontCards.forEach(card => {
                card.classList.remove('front');
                const parentPopup = card.closest('.leaflet-popup');
                if (parentPopup) parentPopup.style.removeProperty('z-index');
            });
            return;
        }

        // 2. 如果没有放大的照片，且处于编辑模式，才执行正常的新建打点逻辑
        if (!isEditMode) return;
        tempClickedLat = e.latlng.lat; tempClickedLng = e.latlng.lng;
        fileInput.click();
    });

    fileInput.addEventListener("change", function(event) {
        const file = event.target.files[0];
        if (!file) return;

        let newName = prompt("スポット名を入力:", "新しいスポット");
        if (newName === null) {
            event.target.value = "";
            return; // 用户点击了“取消”，彻底中止
        }
        if (newName.trim() === "") {
            newName = "名もなきスポット"; // 用户清空了名字但点了确定，给予默认名
        }

        compressImage(file, function(compressedBase64) {
            fetch("/api/add_marker", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat: tempClickedLat, lng: tempClickedLng, name: newName, image_base64: compressedBase64, description: "", password: secretPassword })
            }).then(() => refreshUI());
        });
        event.target.value = "";
    });

   // ==========================================
    // 【终极进化版】智能寻轨照片 GPS 解析 + 逆地理编码自动命名
    // ==========================================
    const smartInput = document.getElementById('smartPhotoUpload');
    const smartBtn = document.getElementById('smartUploadBtn');

    if(smartInput) {
        smartInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const originalBtnText = smartBtn.innerHTML;
            smartBtn.innerHTML = "⏳ 解析中...";
            smartBtn.disabled = true;

            const timeoutSafeguard = setTimeout(() => {
                smartBtn.innerHTML = originalBtnText;
                smartBtn.disabled = false;
                e.target.value = '';
                alert("❌ 解析超时！文件可能太大或格式不兼容。");
            }, 5000); // 考虑到要请求地名，超时时间放宽到 5 秒

            EXIF.getData(file, function() {
                clearTimeout(timeoutSafeguard);

                try {
                    const latDMS = EXIF.getTag(this, "GPSLatitude");
                    const lngDMS = EXIF.getTag(this, "GPSLongitude");

                    if (latDMS && lngDMS) {
                        const finalLat = convertDMSToDD(latDMS, EXIF.getTag(this, "GPSLatitudeRef"));
                        const finalLng = convertDMSToDD(lngDMS, EXIF.getTag(this, "GPSLongitudeRef"));

                        if (!finalLat || !finalLng || isNaN(finalLat) || isNaN(finalLng)) {
                            alert("❌ 提取到的 GPS 卫星坐标格式不标准。");
                            smartBtn.innerHTML = originalBtnText;
                            smartBtn.disabled = false;
                            e.target.value = '';
                            return;
                        }

                        // 🚀 新增：利用逆地理编码接口，将经纬度转换为真实物理地名
                        smartBtn.innerHTML = "🌍 住所解析中...";

                        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${finalLat}&lon=${finalLng}`)
                            .then(res => res.json())
                            .then(geoData => {
                                let defaultPlaceName = "思い出の場所";

                                // 智能提取最贴近的地理级别名称（如具体地标、街区、城镇）
                                if (geoData && geoData.address) {
                                    defaultPlaceName = geoData.address.amenity || geoData.address.neighbourhood || geoData.address.suburb || geoData.address.village || geoData.address.town || geoData.address.city || defaultPlaceName;
                                }

                                // 弹出提示框，默认值已经是真实地名了！
                                let newName = prompt("📍 成功定位！请输入地点名称:", defaultPlaceName);

                                if (newName === null) {
                                    smartBtn.innerHTML = originalBtnText;
                                    smartBtn.disabled = false;
                                    e.target.value = '';
                                    return; // 取消上传
                                }
                                if (newName.trim() === "") newName = defaultPlaceName; // 留空则使用获取到的地名

                                executeUpload(finalLat, finalLng, newName, file);
                            })
                            .catch(err => {
                                // 万一没网或者解析地名失败，不阻断上传，降级使用默认名字
                                let newName = prompt("📍 成功定位！请输入地点名称:", "思い出の場所");
                                if (newName === null) {
                                    smartBtn.innerHTML = originalBtnText;
                                    smartBtn.disabled = false;
                                    e.target.value = '';
                                    return;
                                }
                                if (newName.trim() === "") newName = "思い出の場所";

                                executeUpload(finalLat, finalLng, newName, file);
                            });

                    } else {
                        alert("❌ 照片内部不包含合法的 GPS 经纬度卫星元数据！");
                        smartBtn.innerHTML = originalBtnText;
                        smartBtn.disabled = false;
                        e.target.value = '';
                    }
                } catch (error) {
                    console.error("EXIF 轨道解析崩溃:", error);
                    alert("❌ 元数据解析过程中发生未捕获的异常。");
                    smartBtn.innerHTML = originalBtnText;
                    smartBtn.disabled = false;
                    e.target.value = '';
                }
            });

            // 内部封装的上传执行器，避免代码重复
            function executeUpload(lat, lng, placeName, imageFile) {
                smartBtn.innerHTML = "🚀 压缩并上传中...";
                compressImage(imageFile, function(compressedBase64) {
                    fetch("/api/add_marker", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ lat: lat, lng: lng, name: placeName, image_base64: compressedBase64, description: "GPSから自动追加", password: secretPassword })
                    })
                    .then(res => {
                        if (!res.ok) throw new Error("网络请求遭拒");
                        return res.json();
                    })
                    .then(() => refreshUI())
                    .catch(err => alert("❌ 上传遇到障碍: " + err.message))
                    .finally(() => {
                        smartBtn.innerHTML = originalBtnText;
                        smartBtn.disabled = false;
                        smartInput.value = '';
                    });
                });
            }
        });
    }

    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.addEventListener("keypress", (e) => { if (e.key === "Enter") searchLocation(); });

    // ==========================================
    // 6. WebSocket 同步通信链路
    // ==========================================
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = function(event) {
        if (event.data === "refresh") {
            refreshUI();
        }
    };

    ws.onclose = function() {
        console.warn("WebSocket 连接已断开。");
    }
}

window.onload = initMap;