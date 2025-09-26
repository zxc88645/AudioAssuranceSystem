"""
AudioAssuranceSystem - 即時轉錄服務
"""

import asyncio
import logging
from collections import defaultdict
from typing import List, Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect

from services.stt_service import STTService

logger = logging.getLogger(__name__)


class RealtimeTranscriptionService:
    """
    管理即時音訊串流的接收、轉錄與結果廣播。
    """

    def __init__(self):
        self.stt_service = STTService()
        # 儲存結果的消費者 (即監控儀表板的前端)
        self.consumers: List[WebSocket] = []
        # 追蹤當前活躍的通話房間 ID
        self.active_room_id: Optional[str] = None
        # 每個房間的音訊緩衝區
        self.audio_buffers: Dict[str, bytearray] = defaultdict(bytearray)
        # 每個房間的 VAD (語音活動偵測) 計時器
        self.vad_timers: Dict[str, asyncio.TimerHandle] = {}
        # VAD 靜音超時（秒），超過這個時間沒有收到新音訊就認為一句話結束
        self.VAD_TIMEOUT = 0.8

    async def handle_audio_producer(self, websocket: WebSocket, room_id: str, client_id: str):
        """處理來自通話前端的音訊來源"""
        await websocket.accept()
        logger.info("即時轉錄服務: 音訊來源 %s 已連接房間 %s", client_id, room_id)
        if self.active_room_id is None:
            self.active_room_id = room_id
            logger.info("即時轉錄服務: 房間 %s 已被設為當前活躍通話", room_id)

        try:
            while True:
                audio_chunk = await websocket.receive_bytes()
                # 只處理當前活躍房間的音訊
                if room_id == self.active_room_id:
                    self._handle_audio_chunk(room_id, audio_chunk)
        except WebSocketDisconnect:
            logger.info("即時轉錄服務: 音訊來源 %s 已從房間 %s 斷開", client_id, room_id)
            # 如果斷開的是當前活躍房間，則清理資源
            if room_id == self.active_room_id:
                # 確保最後的緩衝區被處理
                if room_id in self.vad_timers:
                    self.vad_timers[room_id].cancel()
                if self.audio_buffers[room_id]:
                    await self._process_buffer(room_id)
                
                logger.info("即時轉錄服務: 活躍房間 %s 已結束", room_id)
                self.active_room_id = None
                if room_id in self.audio_buffers:
                    del self.audio_buffers[room_id]

    def _handle_audio_chunk(self, room_id: str, chunk: bytes):
        """處理收到的音訊塊並重置 VAD 計時器"""
        self.audio_buffers[room_id].extend(chunk)

        # 如果存在舊的計時器，取消它
        if room_id in self.vad_timers:
            self.vad_timers[room_id].cancel()

        # 設定一個新的計時器，在 VAD_TIMEOUT 秒後觸發處理
        loop = asyncio.get_event_loop()
        self.vad_timers[room_id] = loop.call_later(
            self.VAD_TIMEOUT,
            lambda: asyncio.create_task(self._process_buffer(room_id))
        )

    async def _process_buffer(self, room_id: str):
        """處理緩衝區中的音訊，進行轉錄並廣播結果"""
        if room_id in self.vad_timers:
            del self.vad_timers[room_id]

        buffer = self.audio_buffers[room_id]
        if not buffer:
            return

        # 清空緩衝區，準備下一次接收
        self.audio_buffers[room_id] = bytearray()
        
        logger.info("即時轉錄服務: 處理房間 %s 的音訊緩衝 (大小: %d bytes)", room_id, len(buffer))
        transcript, _ = await self.stt_service.transcribe_audio_bytes(bytes(buffer))

        if transcript:
            logger.info("即時轉錄結果 (%s): %s", room_id, transcript)
            await self._broadcast_result(transcript)

    async def handle_results_consumer(self, websocket: WebSocket):
        """處理來自監控儀表板的結果消費者"""
        await websocket.accept()
        self.consumers.append(websocket)
        logger.info("即時轉錄服務: 一個新的監控儀表板已連接")
        try:
            # 保持連線開啟，直到客戶端斷開
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            self.consumers.remove(websocket)
            logger.info("即時轉錄服務: 一個監控儀表板已斷開")

    async def _broadcast_result(self, transcript: str):
        """將轉錄結果廣播給所有消費者"""
        disconnected_consumers = []
        for consumer in self.consumers:
            try:
                await consumer.send_text(transcript)
            except Exception:
                disconnected_consumers.append(consumer)
        
        # 清理已斷開的連線
        for consumer in disconnected_consumers:
            self.consumers.remove(consumer)


realtime_transcription_service = RealtimeTranscriptionService()