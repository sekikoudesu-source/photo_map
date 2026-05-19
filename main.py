import os
import json
import sqlite3
import uvicorn
import webbrowser
import threading
import sys
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# --- 1. 确定运行路径 (兼容 PyInstaller 打包) ---
if getattr(sys, 'frozen', False):
    # 如果是打包后的 exe 运行
    BASE_DIR = sys._MEIPASS
else:
    # 如果是普通的 python 脚本运行
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- 2. 設定の読み込み ---
config_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
with open(config_path, "r", encoding="utf-8") as f:
    config = json.load(f)

DB_FILE = config["database"]["file_name"]
EDIT_PASSWORD = config["edit_password"]
MAP_PROVIDER = config.get("map_provider", "leaflet").lower()
GOOGLE_API_KEY = config.get("google_maps_api_key", "")

app = FastAPI()

# --- 3. 挂载静态文件目录 (CSS / JS) ---
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")


# --- 4. データベースの初期化 ---
def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS markers
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       name
                       TEXT
                       NOT
                       NULL,
                       lat
                       REAL
                       NOT
                       NULL,
                       lng
                       REAL
                       NOT
                       NULL,
                       description
                       TEXT,
                       image_base64
                       TEXT
                   )
                   ''')
    cursor.execute('''
                   CREATE TABLE IF NOT EXISTS photos
                   (
                       id
                       INTEGER
                       PRIMARY
                       KEY
                       AUTOINCREMENT,
                       marker_id
                       INTEGER
                       NOT
                       NULL,
                       image_base64
                       TEXT
                       NOT
                       NULL,
                       FOREIGN
                       KEY
                   (
                       marker_id
                   ) REFERENCES markers
                   (
                       id
                   ) ON DELETE CASCADE
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


# --- 5. データモデル ---
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


# --- 6. API エンドポイント ---
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


# --- 7. 读取外部 HTML 文件 ---
@app.get("/")
def get_html():
    if MAP_PROVIDER == "google":
        html_file = os.path.join(BASE_DIR, "templates", "google.html")
    else:
        html_file = os.path.join(BASE_DIR, "templates", "leaflet.html")

    with open(html_file, "r", encoding="utf-8") as file:
        html_content = file.read()

    # 如果是 Google Maps，动态注入 API 密钥
    if MAP_PROVIDER == "google":
        html_content = html_content.replace("REPLACE_ME_API_KEY", GOOGLE_API_KEY)

    return HTMLResponse(content=html_content)


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