"""
AudioAssuranceSystem - 分析編排服務 (版本 1.1 - 修正參數名稱)
負責編排 STT 和 LLM 服務，對比音檔並生成分析報告。
"""

import asyncio
import logging
from typing import Dict, Optional

from models.call_models import (
    AnalysisReport,
    AnalysisStatus,
    AudioFile,
    LlmAnalysisResult,
    SttResult,
)

from services.llm_service import LLMService
from services.stt_service import STTService

logger = logging.getLogger(__name__)


class AnalysisService:
    """
    分析流程的總指揮官。
    """

    def __init__(self):
        """初始化分析服務，並實例化其依賴的 AI 服務。"""
        try:
            self.stt_service = STTService()
            self.llm_service = LLMService()
            self.reports: Dict[str, AnalysisReport] = {}
            logger.info("分析服務 (AnalysisService) 初始化完成")
        except Exception as e:
            logger.error("分析服務初始化失敗: %s", e)
            raise

    async def create_and_run_analysis(
        self,
        call_session_id: str,
        recording_file: AudioFile,
        monitoring_file: AudioFile,
    ):
        """
        建立一個新的分析報告任務，並在背景非同步執行它。
        """
        report = AnalysisReport(
            call_session_id=call_session_id,
            status=AnalysisStatus.PENDING,
        )
        self.reports[report.report_id] = report
        logger.info(
            "已為通話 %s 建立分析任務，ID: %s", call_session_id, report.report_id
        )

        asyncio.create_task(
            self._run_analysis_pipeline(report, recording_file, monitoring_file)
        )

    async def _run_analysis_pipeline(
        self,
        report: AnalysisReport,
        recording_file: AudioFile,
        monitoring_file: AudioFile,
    ):
        """
        真正執行分析的內部管線 (Pipeline)。
        """
        try:
            report.status = AnalysisStatus.PROCESSING
            logger.info("分析任務 %s 開始處理...", report.report_id)

            # --- STT 階段：並行處理兩個音檔 ---
            logger.info("分析任務 %s：開始 STT 轉錄...", report.report_id)
            stt_tasks = [
                self.stt_service.transcribe_audio(recording_file.file_path),
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
            logger.info("✅ 分析任務 %s 已成功完成", report.report_id)

        except Exception as e:
            error_message = f"分析管線發生錯誤: {e}"
            logger.error(
                "❌ %s (任務ID: %s)", error_message, report.report_id, exc_info=True
            )
            report.status = AnalysisStatus.ERROR
            report.error_message = error_message

    def get_report(self, report_id: str) -> Optional[AnalysisReport]:
        """根據 ID 獲取分析報告。"""
        return self.reports.get(report_id)


analysis_service = AnalysisService()
