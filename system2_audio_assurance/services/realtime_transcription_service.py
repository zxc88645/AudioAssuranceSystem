"""
AudioAssuranceSystem - 即時轉錄服務
"""

import asyncio
import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

from fastapi import WebSocket, WebSocketDisconnect

from models.call_models import MonitoringProgressStatus
from services.stt_service import STTService


logger = logging.getLogger(__name__)


class RealtimeTranscriptionService:
    """管理即時串流轉錄與監控推播"""

    def __init__(self):
        self.stt_service = STTService()
        # 儲存目前訂閱結果的監控端 WebSocket
        self.consumers: List[WebSocket] = []
        # 追蹤目前活躍的通話房間
        self.active_room_id: Optional[str] = None
        # 針對每個房間的音訊緩衝
        self.audio_buffers: Dict[str, bytearray] = defaultdict(bytearray)
        # VAD 計時器，控制當音訊靜止時觸發轉錄
        self.vad_timers: Dict[str, asyncio.TimerHandle] = {}
        # 音訊靜止多久 (秒) 視為片段結束
        self.VAD_TIMEOUT = 0.8
        # 進度條目前狀態與通話 ID
        self.current_status: MonitoringProgressStatus = MonitoringProgressStatus.WAITING_FOR_CALL
        self.current_call_id: Optional[str] = None
        # 延遲重置進度條的工作
        self._reset_task: Optional[asyncio.Task] = None

    def _cancel_reset_task(self):
        """取消尚未執行的延遲重置工作"""
        if self._reset_task and not self._reset_task.done():
            self._reset_task.cancel()
        self._reset_task = None

    def schedule_waiting_reset(self, delay: float = 3.0):
        """在指定秒數後將狀態重置為等待下一通通話"""
        self._cancel_reset_task()
        loop = asyncio.get_event_loop()
        self._reset_task = loop.create_task(self._delayed_reset(delay))

    async def _delayed_reset(self, delay: float):
        try:
            await asyncio.sleep(delay)
            self._reset_task = None
            await self.broadcast_status(
                MonitoringProgressStatus.WAITING_FOR_CALL,
                session_id=None,
                force=True,
            )
        except asyncio.CancelledError:
            return

    async def broadcast_status(
        self,
        status: MonitoringProgressStatus,
        session_id: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
        force: bool = False,
    ):
        """廣播進度狀態到所有監控端"""
        if status == MonitoringProgressStatus.WAITING_FOR_CALL:
            target_session = None
        else:
            target_session = session_id or self.current_call_id or self.active_room_id

        if (
            not force
            and status == self.current_status
            and target_session == self.current_call_id
        ):
            return

        self._cancel_reset_task()

        if status == MonitoringProgressStatus.WAITING_FOR_CALL:
            self.current_call_id = None
        else:
            if target_session:
                self.current_call_id = target_session

        self.current_status = status

        payload: Dict[str, Any] = {
            "type": "status",
            "status": status.value,
            "session_id": self.current_call_id if status != MonitoringProgressStatus.WAITING_FOR_CALL else None,
        }
        if extra:
            payload["extra"] = extra

        await self._broadcast_payload(payload)

    async def handle_audio_producer(self, websocket: WebSocket, room_id: str, client_id: str):
        """接收來自話務端的即時音訊串流"""
        await websocket.accept()
        logger.info("即時轉錄: 來源 %s 已連線房間 %s", client_id, room_id)

        if self.active_room_id is None:
            self.active_room_id = room_id
            logger.info("即時轉錄: 房間 %s 設為目前活躍通話", room_id)
            await self.broadcast_status(
                MonitoringProgressStatus.RECORDING_STARTED,
                session_id=room_id,
            )

        try:
            while True:
                audio_chunk = await websocket.receive_bytes()
                if room_id == self.active_room_id:
                    self._handle_audio_chunk(room_id, audio_chunk)
        except WebSocketDisconnect:
            logger.info("即時轉錄: 來源 %s 與房間 %s 連線中斷", client_id, room_id)
            if room_id == self.active_room_id:
                if room_id in self.vad_timers:
                    self.vad_timers[room_id].cancel()
                if self.audio_buffers[room_id]:
                    await self._process_buffer(room_id)

                logger.info("即時轉錄: 活躍房間 %s 已結束", room_id)
                await self.broadcast_status(
                    MonitoringProgressStatus.CALL_ENDED,
                    session_id=room_id,
                )
                self.active_room_id = None
                if room_id in self.audio_buffers:
                    del self.audio_buffers[room_id]
        except Exception as exc:
            logger.error("即時轉錄: 房間 %s 發生未預期錯誤: %s", room_id, exc, exc_info=True)
            await self.broadcast_status(
                MonitoringProgressStatus.CALL_ENDED,
                session_id=room_id,
                force=True,
            )
            self.active_room_id = None
            if room_id in self.audio_buffers:
                del self.audio_buffers[room_id]

    def _handle_audio_chunk(self, room_id: str, chunk: bytes):
        """處理即時音訊片段並重設 VAD 計時器"""
        self.audio_buffers[room_id].extend(chunk)

        if room_id in self.vad_timers:
            self.vad_timers[room_id].cancel()

        loop = asyncio.get_event_loop()
        self.vad_timers[room_id] = loop.call_later(
            self.VAD_TIMEOUT,
            lambda: asyncio.create_task(self._process_buffer(room_id)),
        )

    async def _process_buffer(self, room_id: str):
        """將緩衝區音訊送往 STT 並廣播轉錄結果"""
        if room_id in self.vad_timers:
            del self.vad_timers[room_id]

        buffer = self.audio_buffers[room_id]
        if not buffer:
            return

        self.audio_buffers[room_id] = bytearray()

        logger.info("即時轉錄: 房間 %s 音訊緩衝量 %d bytes", room_id, len(buffer))
        transcript, _ = await self.stt_service.transcribe_audio_bytes(bytes(buffer))

        if transcript:
            logger.info("即時轉錄結果 (%s): %s", room_id, transcript)
            await self._broadcast_result(room_id, transcript)

    async def handle_results_consumer(self, websocket: WebSocket):
        """處理監控前端的訂閱連線"""
        await websocket.accept()
        self.consumers.append(websocket)
        logger.info("即時轉錄: 新增監控端連線 (目前 %d 個)", len(self.consumers))

        try:
            await websocket.send_json(
                {
                    "type": "status",
                    "status": self.current_status.value,
                    "session_id": self.current_call_id,
                    "is_snapshot": True,
                }
            )
        except Exception as exc:
            logger.warning("即時轉錄: 傳送狀態快照失敗: %s", exc)

        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            if websocket in self.consumers:
                self.consumers.remove(websocket)
            logger.info("即時轉錄: 一個監控端連線已中斷 (剩餘 %d 個)", len(self.consumers))
        except Exception as exc:
            if websocket in self.consumers:
                self.consumers.remove(websocket)
            logger.error("即時轉錄: 監控端連線錯誤: %s", exc, exc_info=True)

    async def _broadcast_result(self, room_id: str, transcript: str):
        payload = {
            "type": "transcript",
            "text": transcript,
            "session_id": room_id,
        }
        await self._broadcast_payload(payload)

    async def _broadcast_payload(self, payload: Dict[str, Any]):
        """共用的廣播輔助方法"""
        disconnected_consumers: List[WebSocket] = []
        for consumer in self.consumers:
            try:
                await consumer.send_json(payload)
            except Exception:
                disconnected_consumers.append(consumer)

        for consumer in disconnected_consumers:
            if consumer in self.consumers:
                self.consumers.remove(consumer)


realtime_transcription_service = RealtimeTranscriptionService()
