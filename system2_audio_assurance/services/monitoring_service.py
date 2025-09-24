"""
AudioAssuranceSystem - 品質監控服務 (系統二版本)
"""

import asyncio
import io
import logging
import subprocess
import tempfile
from pathlib import Path
from collections import defaultdict
from typing import Dict, List, DefaultDict, Optional

from fastapi import WebSocket
from pydub import AudioSegment

from config.settings import settings
from utils.audio_utils import save_audio_file
from services.storage_service import storage_service
from services.analysis_coordinator import analysis_coordinator

logger = logging.getLogger(__name__)


class MonitoringStreamHandler:
    def __init__(self, room_id: str, client_id: str):
        self.room_id = room_id
        self.client_id = client_id
        self.audio_chunks: List[bytes] = []
        self.is_active = True
        self.chunk_count = 0

    def add_chunk(self, chunk: bytes):
        if self.is_active:
            self.audio_chunks.append(chunk)
            self.chunk_count += 1

    def get_full_stream(self) -> bytes:
        return b"".join(self.audio_chunks)


class MonitoringService:
    def __init__(self):
        self.rooms: DefaultDict[str, Dict[str, MonitoringStreamHandler]] = defaultdict(
            dict
        )
        self._processing_locks: Dict[str, asyncio.Lock] = {}

    async def handle_new_connection(
        self, websocket: WebSocket, room_id: str, client_id: str
    ):
        if room_id not in self._processing_locks:
            self._processing_locks[room_id] = asyncio.Lock()
        async with self._processing_locks[room_id]:
            handler = MonitoringStreamHandler(room_id, client_id)
            self.rooms[room_id][client_id] = handler
            logger.info(
                "監控服務: 客戶端 %s 開始在房間 %s 進行側錄串流", client_id, room_id
            )
        try:
            while True:
                audio_chunk = await websocket.receive_bytes()
                handler.add_chunk(audio_chunk)
        except Exception as e:
            logger.info(
                "監控服務: 客戶端 %s 在房間 %s 的連線中斷: %s", client_id, room_id, e
            )
        finally:
            await self.handle_disconnection(room_id, client_id)

    async def handle_disconnection(self, room_id: str, client_id: str):
        if room_id not in self.rooms or client_id not in self.rooms[room_id]:
            return
        handler = self.rooms[room_id][client_id]
        logger.info(
            "監控服務: 客戶端 %s 已在房間 %s 停止側錄 (共收到 %d 個音訊塊)",
            client_id,
            room_id,
            handler.chunk_count,
        )
        handler.is_active = False
        is_room_empty = all(not h.is_active for h in self.rooms[room_id].values())
        if is_room_empty:
            logger.info("監控服務: 房間 %s 已無活躍側錄，開始處理參考音檔...", room_id)
            async with self._processing_locks[room_id]:
                is_still_empty = all(
                    not h.is_active for h in self.rooms[room_id].values()
                )
                if is_still_empty:
                    await self._process_and_save_monitoring_audio(room_id)
                    if room_id in self.rooms:
                        del self.rooms[room_id]
                    if room_id in self._processing_locks:
                        del self._processing_locks[room_id]
                    logger.info("監控服務: 房間 %s 已處理完畢並清理", room_id)

    def _load_audio_from_stream(self, stream_bytes: bytes) -> Optional[AudioSegment]:
        if not stream_bytes:
            return None
        command = [
            "ffmpeg",
            "-i",
            "pipe:0",
            "-f",
            "wav",
            "-hide_banner",
            "-loglevel",
            "error",
            "pipe:1",
        ]
        try:
            process = subprocess.run(
                command, input=stream_bytes, capture_output=True, check=True
            )
            return AudioSegment.from_file(io.BytesIO(process.stdout), format="wav")
        except Exception as e:
            logger.error("MonitoringService 的 FFmpeg 解碼失敗: %s", e)
            return None

    async def _process_and_save_monitoring_audio(self, room_id: str):
        """核心處理邏輯：合併、歸檔，並通知協調器。"""
        temp_filepath = None
        try:
            room_handlers = list(self.rooms.get(room_id, {}).values())
            if not room_handlers:
                return
            audio_segments = [
                self._load_audio_from_stream(h.get_full_stream()) for h in room_handlers
            ]
            valid_audio_segments = [seg for seg in audio_segments if seg is not None]
            if not valid_audio_segments:
                logger.warning("監控服務: 房間 %s 未收到任何有效側錄音訊...", room_id)
                return
            combined_audio = valid_audio_segments[0]
            for seg in valid_audio_segments[1:]:
                combined_audio = combined_audio.overlay(seg)
            with tempfile.NamedTemporaryFile(
                delete=False, suffix=".wav", dir=settings.AUDIO_PATH
            ) as tmp:
                temp_filepath = Path(tmp.name)
            output_buffer = io.BytesIO()
            combined_audio.export(output_buffer, format="wav")
            save_audio_file(output_buffer.getvalue(), temp_filepath)
            logger.info(f"監控服務: 側錄音檔已短期歸檔至: {temp_filepath.name}")
            participant_ids = [h.client_id for h in room_handlers]
            monitoring_audio_file = storage_service.archive_audio(
                source_path_str=str(temp_filepath),
                call_session_id=room_id,
                participant_ids=participant_ids,
            )

            await analysis_coordinator.set_monitoring_file(
                room_id, monitoring_audio_file
            )

        except Exception as e:
            logger.error(
                "❌ 處理房間 %s 的側錄音檔時發生錯誤: %s", room_id, e, exc_info=True
            )
        finally:
            if temp_filepath and temp_filepath.exists():
                try:
                    temp_filepath.unlink()
                    logger.info("監控服務: 已清理短期歸檔檔案: %s", temp_filepath.name)
                except OSError as e:
                    logger.error(
                        "監控服務: 清理短期歸檔檔案 %s 失敗: %s", temp_filepath.name, e
                    )


monitoring_service = MonitoringService()
