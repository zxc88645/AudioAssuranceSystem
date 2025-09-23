import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.signaling_service import signaling_service
from services.recording_service import recording_service
from services.monitoring_service import monitoring_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ws", tags=["WebSocket"])


@router.websocket("/signaling/{room_id}/{client_id}")
async def signaling_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """WebRTC 信令伺服器端點。"""
    try:
        await signaling_service.join_room(room_id, client_id, websocket)
        while True:
            message = await websocket.receive_json()
            logger.debug("收到來自 %s 的信令訊息: %s", client_id, message)
            await signaling_service.broadcast_to_room(
                room_id=room_id, message=message, sender_id=client_id
            )
    except WebSocketDisconnect:
        logger.info("客戶端 %s 在房間 %s 中斷開信令連線", client_id, room_id)
    except Exception as e:
        logger.error(
            "在與客戶端 %s 的信令通訊中發生錯誤: %s", client_id, e, exc_info=True
        )
    finally:
        await signaling_service.leave_room(room_id, client_id)


@router.websocket("/recording/{room_id}/{client_id}")
async def recording_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """系統一 (內部錄音系統) 的音訊串流接收端點。"""
    await websocket.accept()
    try:
        await recording_service.handle_new_connection(websocket, room_id, client_id)
    except Exception as e:
        logger.error(
            "在錄音連線中發生錯誤 (房間: %s, 客戶端: %s): %s", room_id, client_id, e
        )


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
