"""
AudioAssuranceSystem - HTTP API 端點
定義了所有與儀表板、報告查詢等相關的 HTTP 路由
"""

from fastapi import APIRouter

# 建立一個專門用於 HTTP API 的路由器
# 之後所有儀表板需要用到的 API 端點都會定義在這裡
router = APIRouter(prefix="/api", tags=["Dashboard"])


# --- 預留的 API 端點範例 ---


@router.get("/reports")
async def get_analysis_reports():
    """
    獲取分析報告列表。
    (此為預留 API，待後續開發完成)
    """
    # 目前先回傳一個空的列表
    return {"reports": []}


@router.get("/reports/{report_id}")
async def get_report_details(report_id: str):
    """
    根據 ID 獲取單一分析報告的詳細資訊。
    (此為預留 API，待後續開發完成)
    """
    return {"message": f"正在查詢報告 ID: {report_id}", "data": {}}
