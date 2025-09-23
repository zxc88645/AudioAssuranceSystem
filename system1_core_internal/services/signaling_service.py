"""
AudioAssuranceSystem - WebRTC 信令服務
"""

import asyncio
import logging
from typing import Dict, Set
from fastapi import WebSocket
from collections import defaultdict

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    管理所有活躍的 WebSocket 連線。
    """

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info("信令服務：客戶端連線成功 - ID: %s", client_id)

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            logger.info("信令服務：客戶端離線 - ID: %s", client_id)

    async def send_personal_message(self, message: dict, client_id: str):
        if client_id in self.active_connections:
            await self.active_connections[client_id].send_json(message)
        else:
            logger.warning("信令服務：嘗試發送訊息失敗，找不到客戶端 ID: %s", client_id)


class RoomManager:
    """
    管理通話房間，核心職責是將信令訊息在同一個房間的參與者之間進行轉發。
    """

    def __init__(self):
        self.rooms: Dict[str, Set[str]] = defaultdict(set)
        self.connection_manager = ConnectionManager()

    async def join_room(self, room_id: str, client_id: str, websocket: WebSocket):
        await self.connection_manager.connect(websocket, client_id)

        join_message = {"type": "peer_joined", "peer_id": client_id}
        await self.broadcast_to_room(room_id, join_message, sender_id=client_id)

        self.rooms[room_id].add(client_id)
        logger.info("信令服務：客戶端 %s 已加入房間 %s", client_id, room_id)

    async def leave_room(self, room_id: str, client_id: str):
        self.connection_manager.disconnect(client_id)

        if room_id in self.rooms and client_id in self.rooms[room_id]:
            self.rooms[room_id].remove(client_id)
            logger.info("信令服務：客戶端 %s 已離開房間 %s", client_id, room_id)

            if not self.rooms[room_id]:
                del self.rooms[room_id]
                logger.info("信令服務：房間 %s 已空，已被移除", room_id)

            leave_message = {"type": "peer_left", "peer_id": client_id}
            await self.broadcast_to_room(room_id, leave_message, sender_id=client_id)

    async def broadcast_to_room(self, room_id: str, message: dict, sender_id: str):
        """
        向指定房間內的所有其他成員廣播訊息 (除了發送者自己)。
        *** 核心修改處 ***: 在轉發的訊息中加入 'from' 欄位。
        """
        if room_id in self.rooms:
            # 建立一個要發送訊息的副本，並附加發送者 ID
            message_to_send = message.copy()
            message_to_send["from"] = sender_id

            tasks = []
            for client_id in self.rooms[room_id]:
                if client_id != sender_id:
                    task = self.connection_manager.send_personal_message(
                        message_to_send, client_id
                    )
                    tasks.append(task)

            if tasks:
                await asyncio.gather(*tasks)


signaling_service = RoomManager()
