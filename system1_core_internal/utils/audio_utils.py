"""
AudioAssuranceSystem - 音訊處理工具模組
提供與音訊檔案處理相關的共用函式。
"""

import logging
from pathlib import Path
from typing import Union

# pydub 是處理音訊的核心函式庫，用於讀取音檔資訊
from pydub import AudioSegment

logger = logging.getLogger(__name__)


def save_audio_file(audio_data: bytes, file_path: Union[str, Path]) -> None:
    """
    將音訊的二進位數據 (bytes) 安全地儲存到指定的檔案路徑。

    Args:
        audio_data (bytes): 音訊的原始二進位數據。
        file_path (Union[str, Path]): 儲存的目標路徑，可以是字串或 Path 物件。

    Raises:
        IOError: 如果在寫入檔案時發生 I/O 錯誤。
    """
    try:
        file_path = Path(file_path)
        # 確保目標目錄存在，如果不存在則遞迴建立
        file_path.parent.mkdir(parents=True, exist_ok=True)

        # 使用 'wb' (write binary) 模式寫入檔案
        with open(file_path, "wb") as f:
            f.write(audio_data)

        logger.debug("音訊檔案已成功儲存至: %s", file_path)

    except IOError as e:
        logger.error("儲存音訊檔案至 %s 時發生 I/O 錯誤: %s", file_path, e)
        # 將原始錯誤重新拋出，讓上層服務可以捕捉並處理
        raise


def get_audio_duration(file_path: Union[str, Path]) -> float:
    """
    使用 pydub 獲取指定音檔的時長。

    Args:
        file_path (Union[str, Path]): 音檔的路徑。

    Returns:
        float: 音檔的時長（秒）。如果檔案無法讀取，則回傳 0.0。
    """
    try:
        file_path_str = str(file_path)
        # 從檔案載入音訊
        audio = AudioSegment.from_file(file_path_str)
        # pydub 的長度是以毫秒為單位，需轉換為秒
        duration_seconds = len(audio) / 1000.0
        return duration_seconds
    except Exception as e:
        logger.warning("無法獲取音檔 %s 的時長: %s", file_path, e)
        return 0.0
