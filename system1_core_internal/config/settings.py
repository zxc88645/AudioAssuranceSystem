"""
AudioAssuranceSystem - 系統配置模組
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# --- 基礎路徑設定 ---
BASE_DIR = Path(__file__).parent.parent


# --- Settings 類別 ---
class Settings:
    """
    集中管理所有應用程式設定的類別。
    """

    # === OpenAI API 設定 (系統一不再需要，但保留以免其他模組報錯) ===
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # === OpenAI 模型設定 (系統一不再需要) ===
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    STT_MODEL: str = os.getenv("STT_MODEL", "whisper-1")
    STT_PROMPT: str = os.getenv("STT_PROMPT", "繁體中文")

    # === 後端服務埠號 (Ports) ===
    # 系統一現在只關心自己的埠號
    SIGNALING_SERVER_PORT: int = int(os.getenv("SIGNALING_SERVER_PORT", "8001"))
    RECORDING_SERVER_PORT: int = int(os.getenv("RECORDING_SERVER_PORT", "8002"))
    DASHBOARD_API_PORT: int = int(os.getenv("DASHBOARD_API_PORT", "8004"))

    # --- *** 核心修改處：新增微服務通訊設定 *** ---
    # 系統二 (品質保障系統) 的 API 位址
    ASSURANCE_SYSTEM_API_URL: str = os.getenv(
        "ASSURANCE_SYSTEM_API_URL", "http://localhost:8005"
    )
    # 系統一自身的公開訪問 URL，用於產生音檔下載連結
    CORE_SYSTEM_BASE_URL: str = os.getenv(
        "CORE_SYSTEM_BASE_URL", f"http://localhost:{DASHBOARD_API_PORT}"
    )
    # --- *** 修改結束 *** ---

    # === 系統設定 ===
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # --- 路徑設定 ---
    BASE_DIR: Path = BASE_DIR
    STORAGE_PATH: Path = (BASE_DIR / os.getenv("STORAGE_PATH", "storage")).resolve()
    AUDIO_PATH: Path = STORAGE_PATH / "audio"

    @classmethod
    def initialize_storage(cls):
        """
        建立所有必要的儲存目錄。
        """
        try:
            cls.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
            cls.AUDIO_PATH.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            print(f"警告：無法建立儲存目錄 {cls.STORAGE_PATH}。錯誤: {e}")

    @classmethod
    def validate(cls) -> None:
        """
        驗證必要的設定是否存在。
        """
        # 系統一不再依賴 OpenAI Key，所以移除驗證
        pass


settings = Settings()
