"""
AudioAssuranceSystem - 通話會話管理器
負責追蹤單次通話的狀態，並在所有必要資源（如兩個音檔）都就緒後，觸發後續流程（如品質分析）。
"""

import asyncio
import logging
from typing import Dict

from models.call_models import AudioFile, CallSession
from services.analysis_service import analysis_service

logger = logging.getLogger(__name__)


class CallSessionManager:
    """管理所有活躍的通話會話，並協調後續處理流程。"""

    def __init__(self):
        """初始化會話管理器"""
        # 使用字典來儲存活躍的會話，以 session_id 為鍵
        self.sessions: Dict[str, CallSession] = {}
        # 為每個會話建立一個非同步鎖，以防止競爭條件
        self._locks: Dict[str, asyncio.Lock] = {}

    async def _get_or_create_session(self, session_id: str) -> CallSession:
        """
        安全地獲取或建立一個會話及其對應的鎖。
        這是一個線程安全的操作。
        """
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
        # 每次設定檔案後，都檢查是否可以觸發下一步
        await self._check_and_trigger_analysis(session_id)

    async def set_monitoring_file(self, session_id: str, audio_file: AudioFile):
        """
        由 monitoring_service 呼叫，設定系統二的側錄參考檔。
        """
        session = await self._get_or_create_session(session_id)
        session.monitoring_file = audio_file
        logger.info("會話 %s：已登錄側錄參考檔", session_id)
        # 每次設定檔案後，都檢查是否可以觸發下一步
        await self._check_and_trigger_analysis(session_id)

    async def _check_and_trigger_analysis(self, session_id: str):
        """
        檢查是否兩個音檔都已準備就緒。如果是，則觸發分析服務。
        這是整個協調流程的核心。
        """
        async with self._locks[session_id]:
            session = self.sessions.get(session_id)
            if not session:
                return

            # 核心檢查：當 recording_file 和 monitoring_file 兩個欄位都已有值時
            if session.recording_file and session.monitoring_file:
                logger.info(
                    "會話 %s：所有音檔均已就緒，準備觸發品質分析...", session_id
                )
                # 呼叫分析服務，並將兩個音檔物件傳遞過去
                await analysis_service.create_and_run_analysis(
                    call_session_id=session_id,
                    recording_file=session.recording_file,
                    monitoring_file=session.monitoring_file,
                )
                # 分析任務已成功觸發，清理這個會話以釋放記憶體
                self._cleanup_session(session_id)

    def _cleanup_session(self, session_id: str):
        """清理已處理完畢的會話，釋放記憶體資源。"""
        if session_id in self.sessions:
            del self.sessions[session_id]
        if session_id in self._locks:
            del self._locks[session_id]
        logger.info("會話 %s 已處理完畢並清理", session_id)


call_session_manager = CallSessionManager()
