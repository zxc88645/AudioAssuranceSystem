"""
AudioAssuranceSystem - 應用程式主啟動入口 (系統一版本)
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
        logger.info("✅ (系統一) 環境設定驗證通過")

        settings.initialize_storage()
        logger.info("✅ (系統一) 儲存目錄已準備就緒於: %s", settings.STORAGE_PATH)
        return True

    except ValueError as e:
        logger.error("❌ (系統一) 環境設定錯誤: %s", e)
        return False


def print_startup_info():
    """
    在終端機中顯示清晰的啟動資訊，告知開發者各服務的狀態。
    """
    print("\n" + "=" * 60)
    print("🚀 系統一：內部核心通話與錄音系統 (Core Internal System)")
    print("=" * 60)
    print(f"🔧 模式: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    print(f"💾 儲存路徑: {settings.STORAGE_PATH}")
    print("\n--- 後端服務 (System 1) ---")
    # 系統一現在只提供這些服務
    print(f"📡 信令 (Signaling): ws://localhost:{settings.DASHBOARD_API_PORT}")
    print(f"🎤 錄音 (Recording): ws://localhost:{settings.DASHBOARD_API_PORT}")
    print(f"📈 核心 API (HTTP): http://localhost:{settings.DASHBOARD_API_PORT}")
    print("\n--- 前端應用 (Provided by System 1) ---")
    print(
        f"📞 通話介面: http://localhost:{settings.DASHBOARD_API_PORT}/call/index.html"
    )
    print("=" * 60 + "\n")


if __name__ == "__main__":
    if not validate_and_initialize():
        print("\n💥 (系統一) 應用程式啟動失敗，請檢查 .env 檔案。")
        sys.exit(1)

    print_startup_info()

    # 為了方便開發，我們假設所有服務都由這一個 Uvicorn 進程在同一個埠號上提供
    # 在真實的生產環境中，信令和錄音可能會是獨立的服務
    app_to_run = "main:app" if settings.DEBUG else app
    uvicorn.run(
        app_to_run,
        host="0.0.0.0",
        port=settings.DASHBOARD_API_PORT,
        reload=settings.DEBUG,
        log_level="info",
    )