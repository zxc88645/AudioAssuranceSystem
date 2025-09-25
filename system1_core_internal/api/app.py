"""
AudioAssuranceSystem - 主 FastAPI 應用程式檔案
負責創建應用、掛載路由、設定中介軟體和服務靜態檔案
"""

import logging
from datetime import datetime
from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from config.settings import settings

from api import routes as http_routes
from api import websocket as websocket_routes

# --- 應用程式初始化 ---

app = FastAPI(
    title="Audio Assurance System (System 1)",
    description="核心通話與錄音系統",
    version="1.0.0",
    debug=settings.DEBUG,
)

# --- 中介軟體 (Middleware) 設定 ---

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 路由 (Router) 掛載 ---

app.include_router(http_routes.router)
app.include_router(websocket_routes.router)


# --- 靜態檔案 (Static Files) 服務設定 ---

try:
    # 提供 /storage 路徑讓前端可以直接存取音檔
    app.mount("/storage", StaticFiles(directory=settings.STORAGE_PATH), name="storage")
except RuntimeError:
    logging.warning("儲存目錄 %s 不存在，暫不掛載。", settings.STORAGE_PATH)

try:
    # 掛載通話介面前端
    app.mount(
        "/call",
        StaticFiles(directory=settings.BASE_DIR / "web/call_app"),
        name="call_app",
    )
except RuntimeError:
    logging.warning("通話前端目錄 'web/call_app' 不存在，暫不掛載。")

try:
    # 掛載錄音檔管理介面前端
    app.mount(
        "/recording_management_app",
        StaticFiles(directory=settings.BASE_DIR / "web/recording_management_app"),
        name="recording_management_app",
    )
except RuntimeError:
    logging.warning("錄音檔管理前端目錄 'web/recording_management_app' 不存在，暫不掛載。")

# --- 根目錄與健康檢查路由 ---

try:
    app.mount(
        "/",
        StaticFiles(directory=settings.BASE_DIR / "web/call_app", html=True),
        name="call_app_root",
    )
except RuntimeError:
    logging.warning("通話前端目錄 'web/call_app' 不存在，無法掛載至根目錄。")


@app.get("/health", tags=["System"])
async def health_check():
    """
    系統健康檢查端點，用於監控服務是否正常運行。
    """
    return {"status": "ok", "timestamp": datetime.now().isoformat()}