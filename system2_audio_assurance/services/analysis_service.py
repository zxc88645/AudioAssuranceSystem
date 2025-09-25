"""
AudioAssuranceSystem - 分析編排服務 (系統二版本)
"""

import asyncio
import logging
from typing import Dict, Optional
import httpx
import tempfile
from pathlib import Path
from datetime import datetime

from models.call_models import (
    AnalysisReport,
    AnalysisStatus,
    AudioFile,
    LlmAnalysisResult,
    SttResult,
)
from services.llm_service import LLMService
from services.stt_service import STTService
from utils.audio_utils import get_audio_duration
from config.settings import settings # 引入 settings

logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(self):
        try:
            self.stt_service = STTService()
            self.llm_service = LLMService()
            self.reports: Dict[str, AnalysisReport] = {}
            self.http_client = httpx.AsyncClient()
            logger.info("分析服務 (AnalysisService) 初始化完成")
        except Exception as e:
            logger.error("分析服務初始化失敗: %s", e)
            raise

    async def create_and_run_analysis(
        self,
        call_session_id: str,
        monitoring_file: AudioFile,
        recording_file_url: str,
    ):
        """建立一個新的分析報告任務，並在背景非同步執行它。"""
        
        relative_monitoring_path = Path(monitoring_file.file_path).relative_to(settings.BASE_DIR.parent)

        report = AnalysisReport(
            call_session_id=call_session_id,
            status=AnalysisStatus.PENDING,
            # 儲存來自系統一的完整 URL
            recording_file_url=recording_file_url,
            # 儲存轉換後的相對路徑
            monitoring_file_path=f"/{relative_monitoring_path.as_posix()}",
        )
        
        self.reports[report.report_id] = report
        logger.info(
            "已為通話 %s 建立分析任務，ID: %s", call_session_id, report.report_id
        )

        asyncio.create_task(
            self._run_analysis_pipeline(report, monitoring_file, recording_file_url)
        )

    async def _download_recording_file(self, url: str) -> Optional[Path]:
        """從指定的 URL 下載官方錄音檔到暫存目錄。"""
        try:
            async with self.http_client.stream("GET", url, timeout=30.0) as response:
                response.raise_for_status()

                # 創建一個暫存檔來儲存下載的內容
                with tempfile.NamedTemporaryFile(
                    delete=False, suffix=".wav"
                ) as tmp_file:
                    temp_filepath = Path(tmp_file.name)
                    async for chunk in response.aiter_bytes():
                        tmp_file.write(chunk)

                    logger.info("已成功從 %s 下載官方錄音檔至 %s", url, temp_filepath)
                    return temp_filepath
        except (httpx.RequestError, httpx.HTTPStatusError) as e:
            logger.error("下載官方錄音檔失敗: %s", e)
            return None

    async def _run_analysis_pipeline(
        self,
        report: AnalysisReport,
        monitoring_file: AudioFile,
        recording_file_url: str,
    ):
        """真正執行分析的內部管線 (Pipeline)。"""
        downloaded_recording_path = None
        try:
            report.status = AnalysisStatus.PROCESSING
            logger.info("分析任務 %s 開始處理...", report.report_id)

            # --- 新增步驟：下載官方錄音檔 ---
            logger.info("分析任務 %s: 開始下載官方錄音檔...", report.report_id)
            downloaded_recording_path = await self._download_recording_file(
                recording_file_url
            )
            if not downloaded_recording_path:
                raise RuntimeError(f"無法下載官方錄音檔從 {recording_file_url}")

            # --- STT 階段：並行處理兩個音檔 ---
            logger.info("分析任務 %s：開始 STT 轉錄...", report.report_id)
            stt_tasks = [
                self.stt_service.transcribe_audio(str(downloaded_recording_path)),
                self.stt_service.transcribe_audio(monitoring_file.file_path),
            ]
            results = await asyncio.gather(*stt_tasks, return_exceptions=True)

            if isinstance(results[0], Exception) or isinstance(results[1], Exception):
                raise RuntimeError(f"STT 轉錄失敗: {results}")

            transcript_recording, _ = results[0]
            transcript_monitoring, _ = results[1]

            report.recording_stt_result = SttResult(transcript=transcript_recording)
            report.monitoring_stt_result = SttResult(transcript=transcript_monitoring)
            logger.info("分析任務 %s：STT 轉錄完成", report.report_id)

            # --- LLM 階段：比對兩份轉錄稿 ---
            logger.info("分析任務 %s：開始 LLM 比對...", report.report_id)
            llm_raw_result = await self.llm_service.analyze_conversation(
                recording_transcript=transcript_recording,
                monitoring_transcript=transcript_monitoring,
            )
            report.llm_analysis = LlmAnalysisResult(**llm_raw_result)
            logger.info(
                "分析任務 %s：LLM 比對完成，準確率: %.1f%%",
                report.report_id,
                report.llm_analysis.accuracy_score,
            )
            report.status = AnalysisStatus.SUCCESS
            report.completed_at = datetime.now() # 增加完成時間
            logger.info("✅ 分析任務 %s 已成功完成", report.report_id)

        except Exception as e:
            error_message = f"分析管線發生錯誤: {e}"
            logger.error(
                "❌ %s (任務ID: %s)", error_message, report.report_id, exc_info=True
            )
            report.status = AnalysisStatus.ERROR
            report.error_message = error_message
            report.completed_at = datetime.now() # 增加完成時間
        finally:
            # 清理下載的暫存檔
            if downloaded_recording_path and downloaded_recording_path.exists():
                downloaded_recording_path.unlink()
                logger.info("分析任務 %s: 已清理下載的暫存檔", report.report_id)

    def get_report(self, report_id: str) -> Optional[AnalysisReport]:
        """根據 ID 獲取分析報告。"""
        return self.reports.get(report_id)


analysis_service = AnalysisService()