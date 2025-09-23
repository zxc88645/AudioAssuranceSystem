import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.monitoring_service import monitoring_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


@router.websocket("/monitoring/{room_id}/{client_id}")
async def monitoring_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """系統二 (品質監控系統) 的音訊串流接收端點。"""
    await websocket.accept()
    try:
        await monitoring_service.handle_new_connection(websocket, room_id, client_id)
    except Exception as e:
        logger.error(
            "在監控連線中發生錯誤 (房間: %s, 客戶端: %s): %s", room_id, client_id, e
        )
