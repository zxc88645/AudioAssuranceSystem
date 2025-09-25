"""
AudioAssuranceSystem - 主 FastAPI 應用程式檔案 (系統二版本)
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
    title="Audio Assurance System (System 2)",
    description="即時音訊品質保障與監控系統",
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
    # 系統二的音檔也需要能被訪問（例如在儀表板中播放）
    app.mount("/storage", StaticFiles(directory=settings.STORAGE_PATH), name="storage")
except RuntimeError:
    logging.warning("儲存目錄 %s 不存在，暫不掛載。", settings.STORAGE_PATH)


try:
    app.mount(
        "/",
        StaticFiles(directory=settings.BASE_DIR / "web/quality_monitoring_app", html=True),
        name="quality_monitoring_app_root",
    )
except RuntimeError:
    logging.warning("品質監控儀表板前端目錄 'web/quality_monitoring_app' 不存在，無法掛載至根目錄。")


# --- 健康檢查路由 ---
@app.get("/health", tags=["System"])
async def health_check():
    """
    系統健康檢查端點。
    """
    return {"status": "ok", "timestamp": datetime.now().isoformat()}