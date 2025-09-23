"""
AudioAssuranceSystem - 通話會話管理器 (系統一版本)
職責：追蹤通話狀態，並在錄音檔就緒後，透過 API 通知品質保障系統。
"""

import asyncio
import logging
from typing import Dict
import httpx  # 引入 httpx 用於發送 API 請求
from pathlib import Path

from models.call_models import AudioFile, CallSession
from config.settings import settings  # 引入 settings

logger = logging.getLogger(__name__)


class CallSessionManager:
    """管理所有活躍的通話會話，並協調後續的通知流程。"""

    def __init__(self):
        """初始化會話管理器"""
        self.sessions: Dict[str, CallSession] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        # 建立一個共用的 httpx 客戶端，提升效能
        self.http_client = httpx.AsyncClient()

    async def _get_or_create_session(self, session_id: str) -> CallSession:
        """安全地獲取或建立一個會話及其對應的鎖。"""
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()

        async with self._locks[session_id]:
            if session_id not in self.sessions:
                self.sessions[session_id] = CallSession(session_id=session_id)
                logger.info("已為 %s 建立新的通話會話", session_id)
            return self.sessions[session_id]

    async def set_recording_file(self, session_id: str, audio_file: AudioFile):
        """
        由 recording_service 呼叫，設定系統一的正式錄音檔。
        """
        session = await self._get_or_create_session(session_id)
        session.recording_file = audio_file
        logger.info("會話 %s：已登錄正式錄音檔", session_id)

        # 觸發通知流程
        await self._notify_assurance_system(session_id, audio_file)

    # --- *** 核心修改處 1：移除 set_monitoring_file *** ---
    # (set_monitoring_file 函式已被刪除)

    async def _notify_assurance_system(self, session_id: str, audio_file: AudioFile):
        """
        當正式錄音檔準備好後，透過 API 通知品質保障系統 (系統二)。
        """
        try:
            # 從 settings 取得系統二的 API 位址
            assurance_api_endpoint = (
                f"{settings.ASSURANCE_SYSTEM_API_URL}/api/internal/analysis-trigger"
            )

            # 將音檔的相對路徑轉換為一個完整的、可公開訪問的 URL
            # 例如：/storage/audio/some-uuid.wav -> http://localhost:8004/storage/audio/some-uuid.wav
            relative_path = Path(audio_file.file_path).relative_to(settings.BASE_DIR)
            download_url = f"{settings.CORE_SYSTEM_BASE_URL}/{relative_path.as_posix()}"

            payload = {
                "call_session_id": session_id,
                "recording_file_url": download_url,
            }

            logger.info(
                "準備通知品質保障系統，目標: %s，內容: %s",
                assurance_api_endpoint,
                payload,
            )

            # 發送非同步 POST 請求
            response = await self.http_client.post(
                assurance_api_endpoint, json=payload, timeout=10.0
            )

            # 檢查回應狀態碼
            response.raise_for_status()

            logger.info("✅ 成功通知品質保障系統，對方回應: %s", response.json())

        except httpx.RequestError as e:
            logger.error("❌ 無法連接到品質保障系統: %s", e)
        except httpx.HTTPStatusError as e:
            logger.error(
                "❌ 品質保障系統回應錯誤: 狀態碼 %d, 內容: %s",
                e.response.status_code,
                e.response.text,
            )
        except Exception as e:
            logger.error("❌ 通知品質保障系統時發生未知錯誤: %s", e, exc_info=True)
        finally:
            # 無論通知成功與否，都清理會話
            self._cleanup_session(session_id)

    def _cleanup_session(self, session_id: str):
        """清理已處理完畢的會話，釋放記憶體資源。"""
        if session_id in self.sessions:
            del self.sessions[session_id]
        if session_id in self._locks:
            del self._locks[session_id]
        logger.info("會話 %s 已處理完畢並清理", session_id)


call_session_manager = CallSessionManager()
