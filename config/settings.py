"""
AudioAssuranceSystem - 系統配置模組
從環境變數載入所有應用程式設定
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

# --- 基礎路徑設定 ---
# Path(__file__) -> /path/to/your/project/AudioAssuranceSystem/config/settings.py
# .parent -> /path/to/your/project/AudioAssuranceSystem/config
# .parent -> /path/to/your/project/AudioAssuranceSystem
BASE_DIR = Path(__file__).parent.parent


# --- Settings 類別 ---
class Settings:
    """
    集中管理所有應用程式設定的類別。
    屬性會從環境變數中讀取，並提供合理的預設值。
    """

    # === OpenAI API 設定 ===
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # === OpenAI 模型設定 ===
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    STT_MODEL: str = os.getenv("STT_MODEL", "whisper-1")
    STT_PROMPT: str = os.getenv("STT_PROMPT", "繁體中文")

    # === 後端服務埠號 (Ports) ===
    # 每個獨立的後端服務監聽自己的埠號，以避免衝突
    SIGNALING_SERVER_PORT: int = int(os.getenv("SIGNALING_SERVER_PORT", "8001"))
    RECORDING_SERVER_PORT: int = int(os.getenv("RECORDING_SERVER_PORT", "8002"))
    MONITORING_SERVER_PORT: int = int(os.getenv("MONITORING_SERVER_PORT", "8003"))
    DASHBOARD_API_PORT: int = int(os.getenv("DASHBOARD_API_PORT", "8004"))

    # === 系統設定 ===
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # --- 路徑設定 ---
    BASE_DIR: Path = BASE_DIR
    STORAGE_PATH: Path = Path(os.getenv("STORAGE_PATH", str(BASE_DIR / "storage")))
    AUDIO_PATH: Path = STORAGE_PATH / "audio"

    @classmethod
    def initialize_storage(cls):
        """
        建立所有必要的儲存目錄。
        這個方法應該在應用程式啟動時被呼叫。
        """
        try:
            cls.STORAGE_PATH.mkdir(parents=True, exist_ok=True)
            cls.AUDIO_PATH.mkdir(parents=True, exist_ok=True)
        except OSError as e:
            print(f"警告：無法建立儲存目錄 {cls.STORAGE_PATH}。錯誤: {e}")

    @classmethod
    def validate(cls) -> None:
        """
        驗證必要的設定是否存在。如果缺少關鍵設定，將拋出 ValueError。
        這個方法應該在應用程式啟動時被呼叫。
        """
        errors = []
        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY 未設定")

        if errors:
            error_message = (
                f"配置錯誤: {', '.join(errors)}。請檢查您的 .env 檔案或環境變數。"
            )
            raise ValueError(error_message)


settings = Settings()
