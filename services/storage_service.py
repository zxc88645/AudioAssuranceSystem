# services/storage_service.py

"""
AudioAssuranceSystem - 長期音檔儲存服務
負責將已完成的錄音檔進行永久歸檔，並管理其後設資料 (Metadata)。
"""

import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Any

from config.settings import settings
from models.call_models import AudioFile
from utils.audio_utils import get_audio_duration

logger = logging.getLogger(__name__)


class StorageService:
    """
    管理音檔的永久儲存與後設資料 (使用記憶體字典模擬資料庫)。
    """

    def __init__(self):
        """初始化音檔儲存服務"""
        self.audio_metadata: Dict[str, Dict[str, Any]] = {}
        logger.info("長期儲存服務 (StorageService) 初始化完成")

    def archive_audio(
        self,
        source_path_str: str,
        call_session_id: str,
        participant_ids: list[str],
    ) -> AudioFile:
        """
        將一個來自短期儲存的音檔進行長期歸檔。

        Args:
            source_path_str: 來源音檔的路徑 (來自 recording_service 的產出)。
            call_session_id: 這次通話的會話 ID。
            participant_ids: 參與者的 ID 列表。

        Returns:
            一個包含檔案永久資訊的 AudioFile Pydantic 物件。

        Raises:
            FileNotFoundError: 如果來源檔案不存在。
            RuntimeError: 如果歸檔過程中發生錯誤。
        """
        try:
            source_path = Path(source_path_str)
            if not source_path.exists():
                raise FileNotFoundError(f"無法歸檔：來源音檔不存在于 {source_path}")

            # 產生一個唯一的檔案 ID (UUID) 作為永久檔名
            file_id = str(uuid.uuid4())
            permanent_filename = f"{file_id}{source_path.suffix}"
            permanent_path = settings.AUDIO_PATH / permanent_filename

            # 複製檔案以完成歸檔
            shutil.copy2(source_path, permanent_path)

            # 獲取新檔案的資訊
            duration = get_audio_duration(permanent_path)
            file_size = permanent_path.stat().st_size

            # 建立並儲存後設資料
            metadata = {
                "file_id": file_id,
                "call_session_id": call_session_id,
                "permanent_path": str(permanent_path),
                "original_filename": source_path.name,
                "file_size_bytes": file_size,
                "duration_seconds": duration,
                "format": source_path.suffix.lstrip("."),
                "archived_at": datetime.now().isoformat(),
                "participant_ids": participant_ids,
            }
            # 在模擬資料庫中儲存
            self.audio_metadata[file_id] = metadata

            logger.info(
                "✅ 音檔已成功長期歸檔. 來源: %s -> 歸檔ID: %s",
                source_path.name,
                file_id,
            )

            # 建立並回傳 Pydantic 模型
            return AudioFile(
                file_path=str(permanent_path),
                duration_seconds=duration,
                file_size_bytes=file_size,
                format=metadata["format"],
                created_at=datetime.fromisoformat(metadata["archived_at"]),
            )
        except Exception as e:
            logger.error("❌ 在歸檔音檔 %s 時發生嚴重錯誤: %s", source_path_str, e)
            raise RuntimeError(f"音檔歸檔失敗: {e}") from e

    def retrieve_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        根據檔案 ID 讀取後設資料。

        Args:
            file_id: 音檔的唯一 ID。

        Returns:
            包含後設資料的字典，若找不到則回傳 None。
        """
        return self.audio_metadata.get(file_id)


storage_service = StorageService()
