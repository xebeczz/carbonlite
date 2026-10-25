from __future__ import annotations

import base64
import json
import logging
from dataclasses import dataclass
from typing import Any

import httpx

from ...config import Settings

logger = logging.getLogger("carbonlite.llm")


class LLMError(Exception):
    pass


@dataclass
class LLMClient:
    settings: Settings

    @property
    def configured(self) -> bool:
        return bool(self.settings.llm_api_key)

    def _messages_with_image(self, system: str, user: str, image_bytes: bytes, mime: str) -> list[dict]:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        return [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{encoded}", "detail": "high"},
                    },
                ],
            },
        ]

    def complete(self, messages: list[dict], model: str) -> str:
        if not self.configured:
            raise LLMError("No LLM API key is configured.")
        url = f"{self.settings.llm_base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.settings.llm_api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": 0,
            "response_format": {"type": "json_object"},
        }
        try:
            with httpx.Client(timeout=self.settings.llm_timeout_seconds) as client:
                response = client.post(url, headers=headers, json=payload)
                if response.status_code == 400 and "response_format" in response.text.lower():
                    payload.pop("response_format", None)
                    response = client.post(url, headers=headers, json=payload)
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPError as exc:
            raise LLMError(f"LLM request failed: {exc}") from exc
        except ValueError as exc:
            raise LLMError("LLM returned a non-JSON HTTP response.") from exc
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMError("LLM response did not contain a message.") from exc
        if isinstance(content, list):
            content = "".join(part.get("text", "") for part in content if isinstance(part, dict))
        if not isinstance(content, str) or not content.strip():
            raise LLMError("LLM returned an empty message.")
        return content

    def extract_from_image(
        self, system: str, user: str, image_bytes: bytes, mime: str, correction: str | None = None
    ) -> str:
        messages = self._messages_with_image(system, user, image_bytes, mime)
        if correction:
            messages.append({"role": "user", "content": correction})
        return self.complete(messages, self.settings.llm_vision_model)

    def extract_from_text(self, system: str, user: str, correction: str | None = None) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        if correction:
            messages.append({"role": "user", "content": correction})
        return self.complete(messages, self.settings.llm_text_model)

    def recommend(self, system: str, user: str) -> str:
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]
        return self.complete(messages, self.settings.llm_text_model)


def parse_json_object(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found")
    candidate = text[start : end + 1]
    data = json.loads(candidate)
    if not isinstance(data, dict):
        raise ValueError("JSON root must be an object")
    return data
