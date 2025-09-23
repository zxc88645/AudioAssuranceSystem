"""
AudioAssuranceSystem - 應用程式主啟動入口
"""

import logging
import sys
import uvicorn

from api.app import app
from config.settings import settings

# --- 日誌設定 ---
# 設定日誌等級與格式，方便追蹤與除錯
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
        # 1. 驗證必要的環境變數 (例如 OPENAI_API_KEY)
        settings.validate()
        logger.info("✅ 環境設定驗證通過")

        # 2. 初始化儲存目錄 (例如 ./storage/audio)
        settings.initialize_storage()
        logger.info("✅ 儲存目錄已準備就緒於: %s", settings.STORAGE_PATH)
        return True

    except ValueError as e:
        logger.error("❌ 環境設定錯誤: %s", e)
        return False


def print_startup_info():
    """
    在終端機中顯示清晰的啟動資訊，告知開發者各服務的狀態。
    """
    print("\n" + "=" * 60)
    print("🚀 AudioAssuranceSystem - 即時音訊品質保障系統")
    print("=" * 60)
    print(f"🔧 模式: {'DEBUG' if settings.DEBUG else 'PRODUCTION'}")
    print(f"💾 儲存路徑: {settings.STORAGE_PATH}")
    print("\n--- 後端服務 ---")
    # 雖然目前在單一進程中運行，但此處反映了架構設計上的分離
    # 這有助於未來將服務拆分為獨立的微服務
    print(f"📡 信令 (Signaling): ws://localhost:{settings.SIGNALING_SERVER_PORT}")
    print(f"🎤 錄音 (Recording): ws://localhost:{settings.RECORDING_SERVER_PORT}")
    print(f"📊 監控 (Monitoring): ws://localhost:{settings.MONITORING_SERVER_PORT}")
    print(f"📈 儀表板 API (HTTP): http://localhost:{settings.DASHBOARD_API_PORT}")
    print("\n--- 前端應用 ---")
    print(
        f"📞 通話介面: http://localhost:{settings.DASHBOARD_API_PORT}/call/index.html"
    )
    print(
        f"📋 儀表板: http://localhost:{settings.DASHBOARD_API_PORT}/dashboard/index.html"
    )
    print("=" * 60 + "\n")


if __name__ == "__main__":
    # 執行啟動前檢查
    if not validate_and_initialize():
        print("\n💥 應用程式啟動失敗，請檢查上述錯誤訊息並修正您的 .env 檔案。")
        sys.exit(1)

    # 顯示啟動資訊
    print_startup_info()

    # 啟動 Uvicorn 伺服器來運行 FastAPI 應用
    # 注意：在目前的單體啟動模式下，所有服務都將由這一個 Uvicorn 進程
    # 在 DASHBOARD_API_PORT 上提供服務。
    app_to_run = "main:app" if settings.DEBUG else app

    uvicorn.run(
        app_to_run,
        host="0.0.0.0",
        port=settings.DASHBOARD_API_PORT,
        reload=settings.DEBUG,
        log_level="info",
    )
