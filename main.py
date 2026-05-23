import sqlite3
import sys

import uvicorn
import json
import os
import base64
from fastapi import FastAPI, Request, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel
from typing import List
from pyngrok import ngrok
app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

CONFIG_FILE = "config.json"

# ==========================================
# 动态读取配置文件
# ==========================================
if not os.path.exists(CONFIG_FILE):
    raise FileNotFoundError(f"未找到配置文件 {CONFIG_FILE}，请确保该文件已放置在项目根目录下。")

with open(CONFIG_FILE, "r", encoding="utf-8") as f:
    config_data = json.load(f)

MASTER_PASSWORD = config_data.get("edit_password", "password")
DB_PATH = config_data.get("database", {}).get("file_name", "map_photos.db")
SERVER_HOST = config_data.get("server", {}).get("host", "0.0.0.0")
SERVER_PORT = config_data.get("server", {}).get("port", 8000)
SERVER_RELOAD = config_data.get("server", {}).get("reload", False)


# ==========================================
# 初始化数据库 (开启 WAL 模式抵御死锁)
# ==========================================
def init_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        cursor = conn.cursor()
        cursor.execute("""
                       CREATE TABLE IF NOT EXISTS markers
                       (
                           id
                           INTEGER
                           PRIMARY
                           KEY
                           AUTOINCREMENT,
                           lat
                           REAL
                           NOT
                           NULL,
                           lng
                           REAL
                           NOT
                           NULL,
                           name
                           TEXT
                           NOT
                           NULL,
                           description
                           TEXT
                       )
                       """)
        cursor.execute("""
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
                           base64
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
                       """)
        conn.commit()
    finally:
        conn.close()


init_db()


# ==========================================
# WebSocket 实时全双工广播站
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass


manager = ConnectionManager()


# ==========================================
# 数据校验模型
# ==========================================
class PasswordVerify(BaseModel):
    password: str


class MarkerCreate(BaseModel):
    lat: float
    lng: float
    name: str
    image_base64: str
    description: str = ""
    password: str


class PhotoCreate(BaseModel):
    image_base64: str
    password: str


class ActionAuth(BaseModel):
    password: str


def verify_auth(password: str):
    if password != MASTER_PASSWORD:
        raise HTTPException(status_code=401, detail="密码不正确")


# ==========================================
# API 路由
# ==========================================
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="leaflet.html")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/api/verify_password")
async def verify_password(data: PasswordVerify):
    verify_auth(data.password)
    return {"status": "ok"}


# 🚀 优化：瘦身版的 JSON 获取接口（不传图片数据）
@app.get("/api/get_markers")
async def get_markers():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM markers")
        markers = [dict(row) for row in cursor.fetchall()]

        for m in markers:
            # 仅提取照片 ID，彻底剥离沉重的 Base64 字符串
            cursor.execute("SELECT id FROM photos WHERE marker_id = ?", (m["id"],))
            m["photos"] = [dict(row) for row in cursor.fetchall()]
        return markers
    finally:
        conn.close()


# 🚀 新增：独立的图片加载管道与一年期强缓存
@app.get("/api/image/{photo_id}")
async def get_image(photo_id: int):
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT base64 FROM photos WHERE id = ?", (photo_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Image not found")

        b64_data = row[0]
        # 清洗前端传来的 "data:image/jpeg;base64," 头部
        if "," in b64_data:
            _, encoded = b64_data.split(",", 1)
        else:
            encoded = b64_data

        image_bytes = base64.b64decode(encoded)

        # 写入强缓存头，让浏览器将照片缓存在本地硬盘 31536000 秒 (一年)
        headers = {
            "Cache-Control": "public, max-age=31536000, immutable"
        }
        return Response(content=image_bytes, media_type="image/jpeg", headers=headers)
    finally:
        conn.close()


@app.post("/api/add_marker")
async def add_marker(data: MarkerCreate):
    verify_auth(data.password)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO markers (lat, lng, name, description) VALUES (?, ?, ?, ?)",
                       (data.lat, data.lng, data.name, data.description))
        marker_id = cursor.lastrowid
        cursor.execute("INSERT INTO photos (marker_id, base64) VALUES (?, ?)", (marker_id, data.image_base64))
        conn.commit()
    finally:
        conn.close()
    await manager.broadcast("refresh")
    return {"status": "ok"}


@app.post("/api/add_photo/{marker_id}")
async def add_photo(marker_id: int, data: PhotoCreate):
    verify_auth(data.password)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO photos (marker_id, base64) VALUES (?, ?)", (marker_id, data.image_base64))
        conn.commit()
    finally:
        conn.close()
    await manager.broadcast("refresh")
    return {"status": "ok"}


@app.delete("/api/delete_marker/{marker_id}")
async def delete_marker(marker_id: int, data: ActionAuth):
    verify_auth(data.password)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM photos WHERE marker_id = ?", (marker_id,))
        cursor.execute("DELETE FROM markers WHERE id = ?", (marker_id,))
        conn.commit()
    finally:
        conn.close()
    await manager.broadcast("refresh")
    return {"status": "ok"}


@app.delete("/api/delete_photo/{photo_id}")
async def delete_photo(photo_id: int, data: ActionAuth):
    verify_auth(data.password)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM photos WHERE id = ?", (photo_id,))
        conn.commit()
    finally:
        conn.close()
    await manager.broadcast("refresh")
    return {"status": "ok"}

if __name__ == "__main__":
    if __name__ == "__main__":
        # 从配置文件读取你的设置 (你代码里原本就有的)
        host = SERVER_HOST
        port = SERVER_PORT

        # ⚠️ 强烈建议：如果你还没在本地终端配置过 ngrok 的 token，可以在这里写死
        # 去 ngrok 官网仪表盘复制你的 Authtoken 替换下面的字符串
        ngrok.set_auth_token("3E0vbDwynMtDXEGkSbi3w7PVmFY_41PjX5GjQPFJWAT1yizvw")

        print("⏳ 正在向 ngrok 申请公网隧道...")

        try:
            # 创建一个指向本地端口的 HTTP 隧道
            # bind_tls=True 强制使用 https，这在现代浏览器调用摄像头或定位时是必须的
            public_url = ngrok.connect(port, bind_tls=True).public_url

            print("\n" + "=" * 50)
            print(f"🚀 公网访问地址已成功生成！")
            print(f"🌍 任何人都可以通过此链接访问: {public_url}")
            print("=" * 50 + "\n")

        except Exception as e:
            print(f"❌ ngrok 隧道建立失败: {e}")
            sys.exit(1)

        # 启动你的 FastAPI 服务器
        # ⚠️ 注意：开启 ngrok 代码调用时，务必将 reload 设为 False
        uvicorn.run("main:app", host=host, port=port, reload=False)