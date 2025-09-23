"""
AudioAssuranceSystem - HTTP API 端點
定義了所有與儀表板、報告查詢等相關的 HTTP 路由
"""

from typing import List
from fastapi import APIRouter, HTTPException

# 匯入我們需要用到的服務與資料模型
from services.analysis_service import analysis_service
from models.call_models import AnalysisReport

# 建立一個專門用於 HTTP API 的路由器
router = APIRouter(prefix="/api", tags=["Dashboard"])


@router.get("/reports", response_model=List[AnalysisReport])
async def get_analysis_reports():
    """
    獲取所有分析報告的列表。
    這個 API 會從 analysis_service 中取得所有已儲存的報告。
    """
    # 從 analysis_service 的 reports 字典中獲取所有的值（即 AnalysisReport 物件）
    reports = list(analysis_service.reports.values())
    return reports


@router.get("/reports/{report_id}", response_model=AnalysisReport)
async def get_report_details(report_id: str):
    """
    根據 ID 獲取單一分析報告的詳細資訊。
    """
    report = analysis_service.get_report(report_id)
    if not report:
        # 如果在 analysis_service 中找不到對應 ID 的報告，回傳 404 錯誤
        raise HTTPException(status_code=404, detail=f"找不到報告 ID: {report_id}")
    return report
