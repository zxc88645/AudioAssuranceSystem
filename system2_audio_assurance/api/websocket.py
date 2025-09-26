import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.monitoring_service import monitoring_service
from services.realtime_transcription_service import realtime_transcription_service


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

@router.websocket("/transcribe/{room_id}/{client_id}")
async def realtime_transcription_endpoint(websocket: WebSocket, room_id: str, client_id: str):
    """
    接收來自前端的即時音訊串流，並交由 RealtimeTranscriptionService 處理。
    """
    try:
        await realtime_transcription_service.handle_audio_producer(websocket, room_id, client_id)
    except Exception as e:
        logger.error("在即時轉錄音訊來源連線中發生錯誤: %s", e)


@router.websocket("/current-transcription")
async def transcription_results_endpoint(websocket: WebSocket):
    """
    將當前活躍通話的轉錄結果，即時推送到監控儀表板。
    """
    try:
        await realtime_transcription_service.handle_results_consumer(websocket)
    except Exception as e:
        logger.error("在即時轉錄結果推送連線中發生錯誤: %s", e)