"""
AudioAssuranceSystem - HTTP API 端點
"""

from fastapi import APIRouter

# 建立一個專門用於 HTTP API 的路由器
router = APIRouter(prefix="/api", tags=["System 1"])


@router.get("/status")
async def get_status():
    """
    一個簡單的狀態檢查端點，確認系統一 API 正常運作。
    """
    return {"system": "Core Internal System", "status": "ok"}
