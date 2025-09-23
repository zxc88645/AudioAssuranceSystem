"""
Analysis Coordinator Service
職責：協調來自 monitoring_service (本地側錄檔) 和 系統一 API (遠端官方檔URL) 的資訊，
並在兩者都準備就緒時，觸發 analysis_service。
"""

import asyncio
import logging
from typing import Dict, Optional
from pydantic import BaseModel
import httpx

from models.call_models import AudioFile
from services.analysis_service import analysis_service

logger = logging.getLogger(__name__)


class AnalysisJob(BaseModel):
    """代表一個分析任務的狀態"""

    call_session_id: str
    monitoring_file: Optional[AudioFile] = None
    recording_file_url: Optional[str] = None
    recording_file: Optional[AudioFile] = None  # 下載後儲存的物件


class AnalysisCoordinator:
    """分析任務的協調器"""

    def __init__(self):
        self.jobs: Dict[str, AnalysisJob] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self.http_client = httpx.AsyncClient()

    async def _get_or_create_job(self, session_id: str) -> AnalysisJob:
        """安全地獲取或建立一個分析任務及其對應的鎖"""
        if session_id not in self._locks:
            self._locks[session_id] = asyncio.Lock()

        async with self._locks[session_id]:
            if session_id not in self.jobs:
                self.jobs[session_id] = AnalysisJob(call_session_id=session_id)
                logger.info("分析協調器：已為 %s 建立新的分析任務", session_id)
            return self.jobs[session_id]

    async def set_monitoring_file(self, session_id: str, audio_file: AudioFile):
        """由 monitoring_service 呼叫，設定側錄參考檔"""
        job = await self._get_or_create_job(session_id)
        job.monitoring_file = audio_file
        logger.info("分析協調器 (會話 %s): 已登錄側錄參考檔", session_id)
        await self._check_and_trigger_analysis(session_id)

    async def set_recording_file_url(self, session_id: str, url: str):
        """由 API 端點呼叫，設定官方錄音檔的下載 URL"""
        job = await self._get_or_create_job(session_id)
        job.recording_file_url = url
        logger.info("分析協調器 (會話 %s): 已登錄官方錄音檔 URL: %s", session_id, url)
        await self._check_and_trigger_analysis(session_id)

    async def _check_and_trigger_analysis(self, session_id: str):
        """檢查是否兩份資料都已就緒，如果是，則觸發分析"""
        async with self._locks[session_id]:
            job = self.jobs.get(session_id)
            if not job or not job.monitoring_file or not job.recording_file_url:
                # 條件不滿足，直接返回
                return

            logger.info(
                "分析協調器 (會話 %s): 所有資源均已就緒，準備觸發品質分析...",
                session_id,
            )

            # 觸發分析服務，傳入本地側錄檔和遠端官方檔 URL
            await analysis_service.create_and_run_analysis(
                call_session_id=session_id,
                monitoring_file=job.monitoring_file,
                recording_file_url=job.recording_file_url,
            )
            self._cleanup_job(session_id)

    def _cleanup_job(self, session_id: str):
        """清理已完成的任務"""
        if session_id in self.jobs:
            del self.jobs[session_id]
        if session_id in self._locks:
            del self._locks[session_id]
        logger.info("分析協調器：會話 %s 已處理完畢並清理", session_id)


analysis_coordinator = AnalysisCoordinator()
