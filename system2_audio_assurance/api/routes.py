"""
AudioAssuranceSystem - HTTP API 端點 (系統二版本)
"""

from typing import List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, HttpUrl

from services.analysis_service import analysis_service
from services.analysis_coordinator import analysis_coordinator  # 引入新的協調器
from models.call_models import AnalysisReport

router = APIRouter(prefix="/api", tags=["Dashboard & Internal"])


# --- 新增的 Pydantic 模型，用於驗證來自系統一的請求 ---
class AnalysisTriggerPayload(BaseModel):
    call_session_id: str
    recording_file_url: HttpUrl  # 使用 HttpUrl 類型會自動驗證 URL 格式


# --- 新增的內部 API 端點，用於接收系統一的通知 ---
@router.post("/internal/analysis-trigger", status_code=202)
async def trigger_analysis(payload: AnalysisTriggerPayload):
    """
    接收來自核心系統 (系統一) 的通知，以觸發一個新的分析任務。
    """
    await analysis_coordinator.set_recording_file_url(
        session_id=payload.call_session_id, url=str(payload.recording_file_url)
    )
    return {
        "message": "Analysis job accepted.",
        "call_session_id": payload.call_session_id,
    }


# --- 原有的報告查詢 API 維持不變 ---
@router.get("/reports", response_model=List[AnalysisReport])
async def get_analysis_reports():
    """獲取所有分析報告的列表。"""
    reports = list(analysis_service.reports.values())
    return reports


@router.get("/reports/{report_id}", response_model=AnalysisReport)
async def get_report_details(report_id: str):
    """根據 ID 獲取單一分析報告的詳細資訊。"""
    report = analysis_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=404, detail=f"找不到報告 ID: {report_id}")
    return report


@router.post("/reset-progress", status_code=200)
async def reset_progress():
    """手動重置進度條狀態。"""
    from services.realtime_transcription_service import realtime_transcription_service
    from models.call_models import MonitoringProgressStatus
    
    await realtime_transcription_service.broadcast_status(
        MonitoringProgressStatus.WAITING_FOR_CALL,
        session_id=None,
        force=True,
    )
    return {"message": "進度條已重置"}
