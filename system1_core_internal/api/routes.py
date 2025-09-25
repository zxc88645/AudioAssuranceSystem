"""
AudioAssuranceSystem - HTTP API 端點
"""

from typing import List, Any
from fastapi import APIRouter
from services.storage_service import storage_service

# 建立一個專門用於 HTTP API 的路由器
router = APIRouter(prefix="/api", tags=["System 1"])


@router.get("/status")
async def get_status():
    """
    一個簡單的狀態檢查端點，確認系統一 API 正常運作。
    """
    return {"system": "Core Internal System", "status": "ok"}

@router.get("/recordings", response_model=List[dict])
async def get_all_recordings() -> List[dict]:
    """
    獲取所有已歸檔的錄音檔後設資料列表。
    這個端點是為了支援 `recording_management_app` 前端介面。
    """
    
    recordings_list = list(storage_service.audio_metadata.values())
    
    recordings_list.sort(key=lambda r: r.get("archived_at"), reverse=True)
    
    return recordings_list