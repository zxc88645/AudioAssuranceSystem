"""
AudioAssuranceSystem - 核心資料模型
定義了應用程式中所有與通話、錄音和分析相關的資料結構
"""

import uuid
from datetime import datetime
from enum import Enum
from typing import List, Optional
from pydantic import BaseModel, Field, HttpUrl

# --- Enums for Status and Roles ---


class ParticipantRole(str, Enum):
    """
    通話參與者角色枚舉
    """

    CUSTOMER = "customer"
    AGENT = "agent"
    UNKNOWN = "unknown"


class CallStatus(str, Enum):
    """
    通話會話狀態枚舉
    """

    INITIALIZING = "initializing"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class AnalysisStatus(str, Enum):
    """
    品質分析任務狀態枚舉
    """

    PENDING = "pending"
    PROCESSING = "processing"
    SUCCESS = "success"
    ERROR = "error"


# --- Core Data Models ---


class Participant(BaseModel):
    """
    代表一位通話參與者的模型
    """

    id: str = Field(..., description="參與者的唯一識別碼，例如客戶ID或客服工號")
    role: ParticipantRole = Field(..., description="參與者的角色")


class AudioFile(BaseModel):
    """
    代表一個已處理和儲存的音檔模型
    """

    file_path: str = Field(..., description="音檔在儲存系統中的相對路徑")
    duration_seconds: float = Field(0.0, description="音檔的總時長（秒）")
    file_size_bytes: int = Field(0, description="音檔的大小（位元組）")
    format: str = Field("wav", description="音檔格式，例如 wav, mp3")
    created_at: datetime = Field(
        default_factory=datetime.now, description="音檔建立時間"
    )


class CallSession(BaseModel):
    """
    代表一個完整的端到端通話會話模型
    """

    session_id: str = Field(
        default_factory=lambda: str(uuid.uuid4()), description="通話會話的唯一ID"
    )
    status: CallStatus = Field(CallStatus.INITIALIZING, description="當前通話狀態")
    participants: List[Participant] = Field([], description="此通話的所有參與者列表")

    start_time: Optional[datetime] = Field(None, description="通話正式開始時間")
    end_time: Optional[datetime] = Field(None, description="通話結束時間")

    # 系統一 (內部錄音) 產出的正式錄音檔
    recording_file: Optional[AudioFile] = Field(
        None, description="系統一產出的正式錄音檔"
    )

    # 系統二 (品質監控) 產出的參考音檔
    monitoring_file: Optional[AudioFile] = Field(
        None, description="系統二側錄的參考音檔"
    )

    class Config:
        """Pydantic模型配置"""

        use_enum_values = True


# --- Analysis Models ---


class SttResult(BaseModel):
    """
    單次 STT (語音轉文字) 的結果模型
    """

    transcript: str = Field(..., description="轉錄出的文字稿")
    confidence: float = Field(
        1.0, description="置信度分數 (預設為1.0，因Whisper不直接提供)"
    )
    language: Optional[str] = Field(None, description="識別出的語言")


class LlmAnalysisResult(BaseModel):
    """
    LLM (大型語言模型) 比對分析的詳細結果模型
    """

    summary: str = Field(..., description="對比對結果的一句話簡潔摘要")
    accuracy_score: float = Field(..., description="語意準確率分數 (0-100)")
    key_differences: List[str] = Field([], description="兩份文稿之間的主要語意差異點")
    suggestions: List[str] = Field([], description="根據差異點提供的具體改進建議")
    reasoning: str = Field(..., description="解釋給出此準確率分數的理由")


class AnalysisReport(BaseModel):
    """
    最終的品質監控分析報告模型
    """

    report_id: str = Field(
        default_factory=lambda: "rep_" + str(uuid.uuid4()), description="報告的唯一ID"
    )
    call_session_id: str = Field(..., description="關聯的通話會話ID")
    status: AnalysisStatus = Field(
        AnalysisStatus.PENDING, description="分析任務的當前狀態"
    )

    recording_file_url: Optional[HttpUrl] = Field(
        None, description="來自系統一的官方錄音檔的完整 URL"
    )
    monitoring_file_path: Optional[str] = Field(
        None, description="系統二儲存的監控側錄檔的相對路徑"
    )

    # 對「正式錄音檔」的轉錄結果
    recording_stt_result: Optional[SttResult] = Field(
        None, description="對正式錄音檔的STT結果"
    )

    # 對「參考音檔」的轉錄結果
    monitoring_stt_result: Optional[SttResult] = Field(
        None, description="對參考音檔的STT結果"
    )

    # 對比兩份轉錄稿的 LLM 分析結果
    llm_analysis: Optional[LlmAnalysisResult] = Field(
        None, description="LLM對比分析結果"
    )

    error_message: Optional[str] = Field(None, description="如果分析失敗，記錄錯誤訊息")
    created_at: datetime = Field(default_factory=datetime.now)
    completed_at: Optional[datetime] = Field(None)

    class Config:
        """Pydantic模型配置"""

        use_enum_values = True
