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

BASE_DIR = Path(__file__).parent.parent


class Settings:
    """
    集中管理所有應用程式設定的類別。
    """

    # === OpenAI API 設定 ===
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")

    # === OpenAI 模型設定 ===
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o")
    STT_MODEL: str = os.getenv("STT_MODEL", "whisper-1")
    STT_PROMPT: str = os.getenv("STT_PROMPT", "繁體中文")

    # === 後端服務埠號 (Ports) ===
    # 系統二現在只關心自己的埠號
    MONITORING_SERVER_PORT: int = int(os.getenv("MONITORING_SERVER_PORT", "8003"))
    DASHBOARD_API_PORT: int = int(
        os.getenv("DASHBOARD_API_PORT", "8005")
    )  # 修改為 8005

    # === 系統設定 ===
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"

    # --- 路徑設定 ---
    BASE_DIR: Path = BASE_DIR
    # 指向一個獨立的儲存目錄
    STORAGE_PATH: Path = Path(
        os.getenv("STORAGE_PATH", str(BASE_DIR / "storage_system2"))
    )
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
        errors = []
        if not cls.OPENAI_API_KEY:
            errors.append("OPENAI_API_KEY 未設定")

        if errors:
            error_message = (
                f"配置錯誤: {', '.join(errors)}。請檢查您的 .env 檔案或環境變數。"
            )
            raise ValueError(error_message)


settings = Settings()
