"""
LLM 服務模組 - 使用 OpenAI GPT 進行對話品質分析
"""

import json
import logging
import re
from typing import Dict, Any
from openai import AsyncOpenAI, APIError

from config.settings import settings

logger = logging.getLogger(__name__)


class LLMService:
    """OpenAI GPT LLM 服務"""

    def __init__(self):
        """初始化 LLM 服務"""
        try:
            if not settings.OPENAI_API_KEY:
                raise ValueError("OpenAI API Key 未設定")
            self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
            self.model = settings.LLM_MODEL
            logger.info("LLM 服務 (非同步) 初始化成功，使用模型: %s", self.model)
        except Exception as e:
            logger.error("LLM 服務初始化失敗: %s", e)
            raise

    async def analyze_conversation(
        self, recording_transcript: str, monitoring_transcript: str
    ) -> Dict[str, Any]:
        """
        分析「正式錄音轉錄稿」與「監控錄音轉錄稿」的內容一致性。
        """
        try:
            if not recording_transcript.strip():
                raise ValueError("正式錄音轉錄稿不能為空")

            if not monitoring_transcript.strip():
                raise ValueError("監控錄音轉錄稿不能為空")

            normalized_recording = self._normalize_text(recording_transcript)
            normalized_monitoring = self._normalize_text(monitoring_transcript)

            logger.info("開始進行錄音內容一致性分析...")

            prompt = self._build_analysis_prompt(
                normalized_recording, normalized_monitoring
            )
            response = await self._call_gpt_api(prompt)
            analysis = self._parse_analysis_response(response)

            logger.info(
                "分析完成 - 內容一致性分數: %.1f%%", analysis.get("accuracy_score", 0)
            )
            return analysis
        except Exception as e:
            logger.error("對話品質分析失敗: %s", e)
            raise RuntimeError(f"LLM 分析錯誤: {e}") from e

    def _normalize_text(self, text: str) -> str:
        """文字正規化處理，移除標點符號並統一空格。"""
        if not text:
            return ""
        text = re.sub(r"\s+", " ", text.strip())
        text = re.sub(r"[^\w\s]", "", text)
        return text.strip()

    def _build_analysis_prompt(self, recording_text: str, monitoring_text: str) -> str:
        """建構分析提示詞"""
        return f"""你是專業的錄音品質稽核員。你的任務是嚴格比對兩份由不同系統產出的語音轉文字(STT)稿，以判斷錄音過程是否遺失了任何對話內容。

【分析目標】
你的唯一目標是判斷「監控系統轉錄稿」是否在「語意」上完整地包含了「正式錄音轉錄稿」的內容。
「正式錄音轉錄稿」應被視為這次對話內容的基準 (Ground Truth)。

【評分標準】
你必須嚴格遵守以下計分規則：
- **100分條件**: 如果「監控系統轉錄稿」在語意上與「正式錄音轉錄稿」完全一致，沒有任何意義上的偏差、扭曲或**內容遺漏**，
一致性分數 **必須** 為 100。即便兩者在用詞、語氣助詞或斷句上存在微小差異（這是STT模型的正常誤差），
只要不影響核心語意，分數就 **必須** 是 100。
- **扣分條件**: 只有在「監控系統轉錄稿」出現了**明顯的語意錯誤、關鍵內容遺漏、或新增了不相關的內容**時，才應該扣分。根據內容遺失或錯誤的嚴重程度酌情給予 0-99 分。

【正式錄音轉錄稿 (基準)】
{recording_text}

【監控系統轉錄稿 (待驗證)】
{monitoring_text}

請嚴格按照上述規則，以 JSON 格式回傳分析結果，包含以下欄位：
- "accuracy_score": 內容一致性分數 (0-100)。
- "summary": 根據比對結果，生成一句話的簡潔摘要。
- "key_differences": 簡潔地列出兩者之間的主要 "語意" 差異點。如果沒有語意差異，請回傳空列表 `[]`。
- "suggestions": 根據差異點，提供錄音系統可能的改進建議。如果沒有差異，請回傳空列表 `[]`。
- "reasoning": 解釋你為什麼嚴格根據評分標準給出這個一致性分數。

請只回傳 JSON 格式的分析結果："""

    async def _call_gpt_api(self, prompt: str, retry_count: int = 0) -> str:
        """呼叫 GPT API (非同步版本)"""
        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "你是一個專業、嚴謹的錄音品質稽核員，專注於比對文字稿的內容一致性。",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0,
                max_tokens=800,
                top_p=0.9,
                response_format={"type": "json_object"},
            )
            return response.choices[0].message.content.strip()
        except APIError as e:
            if retry_count < 2:
                logger.warning(
                    "GPT API 呼叫失敗，重試中 (%d/2): %s", retry_count + 1, e
                )
                return await self._call_gpt_api(prompt, retry_count + 1)
            logger.error("GPT API 呼叫失敗: %s", e)
            raise RuntimeError(f"OpenAI API 錯誤: {e}") from e

    def _parse_analysis_response(self, response_text: str) -> Dict[str, Any]:
        """(維持不變) 解析 GPT 回應"""
        try:
            result = json.loads(response_text.strip())
            default_result = {
                "accuracy_score": 0.0,
                "summary": "分析完成",
                "key_differences": [],
                "suggestions": [],
                "reasoning": "",
            }
            for key, default_value in default_result.items():
                result.setdefault(key, default_value)
            result["accuracy_score"] = max(0, min(100, float(result["accuracy_score"])))
            return result
        except (json.JSONDecodeError, TypeError, ValueError) as e:
            logger.warning("JSON 解析失敗: %s", e)
            logger.warning("原始回應: %s", response_text)
            return {
                "accuracy_score": 0.0,
                "summary": "分析過程發生錯誤",
                "key_differences": [],
                "suggestions": ["檢查輸入資料", "重新嘗試分析"],
                "reasoning": f"無法解析分析結果: {str(e)}",
            }

    async def test_connection(self) -> bool:
        """(維持不變) 測試 OpenAI GPT 連接"""
        try:
            logger.info("測試 OpenAI GPT (%s) 連接...", self.model)
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": "回答'測試成功'"}],
                max_tokens=10,
            )
            return "測試成功" in response.choices[0].message.content
        except Exception as e:
            logger.error("LLM 連接測試失敗: %s", e)
            return False
