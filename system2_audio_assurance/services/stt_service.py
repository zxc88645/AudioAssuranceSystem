"""
STT 服務模組 - 使用 OpenAI STT
"""

import logging
from pathlib import Path
from typing import Tuple
from openai import AsyncOpenAI, APIError

from config.settings import settings

logger = logging.getLogger(__name__)


class STTService:
    """OpenAI STT 服務"""

    def __init__(self):
        """初始化 STT 服務"""
        try:
            if not settings.OPENAI_API_KEY:
                raise ValueError("OpenAI API Key 未設定")

            self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            self.model = settings.STT_MODEL
            self.prompt = settings.STT_PROMPT

            logger.info("STT 服務 (非同步) 初始化成功")

        except Exception as e:
            logger.error("STT 服務初始化失敗: %s", e)
            raise

    async def transcribe_audio(self, audio_file_path: str) -> Tuple[str, float]:
        """使用 OpenAI STT 轉錄音檔 (非同步版本)"""
        try:
            audio_path = Path(audio_file_path)

            if not audio_path.exists():
                raise FileNotFoundError(f"音檔不存在: {audio_file_path}")

            file_size = audio_path.stat().st_size
            max_size = 25 * 1024 * 1024

            if file_size > max_size:
                raise ValueError(
                    f"檔案過大: {file_size / 1024 / 1024:.1f}MB，超過 25MB 限制"
                )

            if file_size < 1024:
                raise ValueError("檔案過小，可能沒有有效的音檔內容")

            logger.info("開始轉錄音檔: %s (%.1f KB)", audio_path.name, file_size / 1024)

            with open(audio_file_path, "rb") as audio_file:
                response = await self.client.audio.transcriptions.create(
                    model=self.model,
                    file=audio_file,
                    language="zh",
                    prompt=self.prompt,
                    response_format="json",
                    temperature=0.0,
                )

            transcript = response.text.strip()

            if not transcript:
                raise ValueError("無法識別語音內容，檔案可能損壞或不包含語音")

            confidence = 1.0

            logger.info(
                "轉錄成功: %s%s",
                transcript[:50],
                "..." if len(transcript) > 50 else "",
            )

            return transcript, confidence

        except APIError as e:
            logger.error("OpenAI API 錯誤: %s", e)
            raise RuntimeError(f"語音轉錄失敗: {e}") from e
        except (FileNotFoundError, ValueError) as e:
            logger.error("檔案處理錯誤: %s", e)
            raise
        except Exception as e:
            logger.error("STT 服務錯誤: %s", e)
            raise RuntimeError(f"語音轉錄失敗: {e}") from e

    async def test_connection(self) -> bool:
        """測試 OpenAI STT 連接 (非同步版本)"""
        try:
            logger.info("測試 OpenAI %s 連接...", self.model)

            models = await self.client.models.list()
            available_models = [model.id for model in models.data]
            model_available = self.model in available_models

            if model_available:
                logger.info("OpenAI %s 連接測試成功", self.model)
                return True
            else:
                logger.warning("未找到 %s 模型", self.model)
                return False
        except APIError as e:
            logger.error("OpenAI API 錯誤: %s", e)
            return False
        except ValueError as e:
            logger.error("值錯誤: %s", e)
            return False
        except (ConnectionError, TimeoutError) as e:
            logger.error("連接或超時錯誤: %s", e)
            return False
