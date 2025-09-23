"""
AudioAssuranceSystem - 核心資料模型
職責：只定義與核心通話、錄音相關的資料結構。
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field

# --- Enums for Status and Roles ---


class ParticipantRole(str, Enum):
    """通話參與者角色枚舉"""

    CUSTOMER = "customer"
    AGENT = "agent"
    UNKNOWN = "unknown"


class CallStatus(str, Enum):
    """通話會話狀態枚舉"""

    INITIALIZING = "initializing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class Participant(BaseModel):
    """代表一位通話參與者的模型"""

    id: str = Field(..., description="參與者的唯一識別碼")
    role: ParticipantRole = Field(..., description="參與者的角色")


class AudioFile(BaseModel):
    """代表一個已處理和儲存的音檔模型"""

    file_path: str = Field(..., description="音檔在儲存系統中的相對路徑")
    duration_seconds: float = Field(0.0, description="音檔的總時長（秒）")
    file_size_bytes: int = Field(0, description="音檔的大小（位元組）")
    format: str = Field("wav", description="音檔格式")
    created_at: datetime = Field(
        default_factory=datetime.now, description="音檔建立時間"
    )


class CallSession(BaseModel):
    """代表一個完整的端到端通話會話模型"""

    session_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="通話會話的唯一ID"
    )
    status: CallStatus = Field(CallStatus.INITIALIZING, description="當前通話狀態")
    participants: List[Participant] = Field([], description="此通話的所有參與者列表")

    start_time: Optional[datetime] = Field(None, description="通話正式開始時間")
    end_time: Optional[datetime] = Field(None, description="通話結束時間")

    recording_file: Optional[AudioFile] = Field(
        None, description="系統一產出的正式錄音檔"
    )

    class Config:
        """Pydantic模型配置"""

        use_enum_values = True
