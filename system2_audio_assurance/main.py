"""
AudioAssuranceSystem - 應用程式主啟動入口 (系統二版本)
"""

import logging
import sys
import uvicorn

from api.app import app
from config.settings import settings

# --- 日誌設定 ---
logging.basicConfig(
    level=settings.DEBUG and "DEBUG" or "INFO",
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def validate_and_initialize():
    """
    在伺服器啟動前，執行所有必要的驗證與初始化步驟。
    """
    try:
        settings.validate()
        logger.info("✅ (系統二) 環境設定驗證通過")

        settings.initialize_storage()
        logger.info("✅ (系統二) 儲存目錄已準備就緒於: %s", settings.STORAGE_PATH)
        return True

    except ValueError as e:
        logger.error("❌ (系統二) 環境設定錯誤: %s", e)
        return False


def print_startup_info():
    """
    在終端機中顯示清晰的啟動資訊，告知開發者各服務的狀態。
    """
    print("\n" + "=" * 60)
    print("🚀 系統二：音訊品質保障系統 (Audio Assurance System)")
    print("=" * 60)
    print(f"🔧 模式: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    print(f"💾 儲存路徑: {settings.STORAGE_PATH}")
    print("\n--- 後端服務 (System 2) ---")
    print(f"📊 監控 (Monitoring): ws://localhost:{settings.DASHBOARD_API_PORT}")
    print(f"📈 分析 API (HTTP): http://localhost:{settings.DASHBOARD_API_PORT}")
    print("\n--- 前端應用 (Provided by System 2) ---")
    
    print(
        f"📋 品質監控儀表板: http://localhost:{settings.DASHBOARD_API_PORT}/"
    )
    
    print("=" * 60 + "\n")


if __name__ == "__main__":
    if not validate_and_initialize():
        print("\n💥 (系統二) 應用程式啟動失敗，請檢查 .env 檔案。")
        sys.exit(1)

    print_startup_info()

    app_to_run = "main:app" if settings.DEBUG else app
    uvicorn.run(
        app_to_run,
        host="0.0.0.0",
        port=settings.DASHBOARD_API_PORT,
        reload=settings.DEBUG,
        log_level="info",
    )