import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
from jose import JWTError, jwt

from app.core.config import settings
from app.core.exceptions import HRMSException


class OnlyOfficeService:
    def build_config(
        self,
        doc_type: str,
        doc_id: int | str,
        file_path: Path,
        title: str,
        callback_url: str,
        file_url: str,
        mode: str = "edit",
    ) -> dict[str, Any]:
        can_edit = mode == "edit"
        config: dict[str, Any] = {
            "document": {
                "fileType": "docx",
                "key": f"{self._generate_key(doc_type, doc_id, file_path)}-{mode}",
                "title": title,
                "url": file_url,
                "permissions": {
                    "comment": can_edit,
                    "copy": True,
                    "download": True,
                    "edit": can_edit,
                    "fillForms": can_edit,
                    "modifyContentControl": can_edit,
                    "modifyFilter": can_edit,
                    "print": True,
                    "review": can_edit,
                },
            },
            "documentType": "word",
            "editorConfig": {
                "callbackUrl": callback_url,
                "lang": "ru",
                "mode": mode,
                "customization": {
                    "autosave": can_edit,
                    "forcesave": can_edit,
                },
            },
            "height": "100%",
            "width": "100%",
        }
        config["token"] = jwt.encode(config, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        return config

    def _generate_key(self, doc_type: str, doc_id: int | str, file_path: Path) -> str:
        if file_path.exists():
            mtime = int(file_path.stat().st_mtime)
        else:
            mtime = int(datetime.utcnow().timestamp())
        safe_doc_id = str(doc_id).replace("/", "-").replace("\\", "-")
        return f"{doc_type}-{safe_doc_id}-{mtime}"

    def validate_callback_token(self, token: str) -> bool:
        try:
            jwt.decode(token, settings.ONLYOFFICE_JWT_SECRET, algorithms=["HS256"])
            return True
        except JWTError:
            return False

    async def force_save(self, document_key: str) -> None:
        payload = {"c": "forcesave", "key": document_key}
        token = jwt.encode(payload, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        body = {**payload, "token": token}
        last_error: Exception | None = None

        for base_url in self._onlyoffice_base_url_candidates():
            command_url = f"{base_url}/coauthoring/CommandService.ashx"
            try:
                async with httpx.AsyncClient(timeout=settings.DOCUMENT_GENERATION_TIMEOUT) as client:
                    response = await client.post(command_url, json=body, headers={"Authorization": f"Bearer {token}"})
                    response.raise_for_status()
                result = response.json()
            except Exception as exc:
                last_error = exc
                continue

            if result.get("error") not in (0, None):
                raise HRMSException(
                    f"OnlyOffice не принял команду сохранения: error={result.get('error')}",
                    "onlyoffice_forcesave_failed",
                    status_code=502,
                )
            return

        raise HRMSException(
            f"Не удалось отправить команду сохранения в OnlyOffice: {last_error}",
            "onlyoffice_forcesave_failed",
            status_code=502,
        )

    def _onlyoffice_base_url_candidates(self) -> list[str]:
        candidates: list[str] = []
        for url in (settings.ONLYOFFICE_INTERNAL_URL, settings.ONLYOFFICE_PUBLIC_URL):
            normalized = url.rstrip("/")
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates

    async def download_and_replace(self, url: str, target_path: Path) -> None:
        download_url = self._normalize_download_url(url)
        download_urls = [download_url]
        if download_url != url:
            download_urls.append(url)
        temp_path = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
        last_error: Exception | None = None
        try:
            content: bytes | None = None
            for candidate_url in download_urls:
                try:
                    async with httpx.AsyncClient(timeout=settings.DOCUMENT_GENERATION_TIMEOUT) as client:
                        response = await client.get(candidate_url)
                        response.raise_for_status()
                    content = response.content
                    break
                except Exception as exc:
                    last_error = exc
                    continue
            if content is None:
                raise last_error or RuntimeError("OnlyOffice file URL is unavailable")
            temp_path.write_bytes(content)
            await self._replace_docx_atomically(target_path, temp_path)
        except Exception as exc:
            if temp_path.exists():
                temp_path.unlink()
            raise HRMSException(
                f"Не удалось сохранить файл из OnlyOffice: {exc}",
                "onlyoffice_save_failed",
                status_code=502,
            ) from exc

    def _normalize_download_url(self, url: str) -> str:
        internal = settings.ONLYOFFICE_INTERNAL_URL.rstrip("/")
        public = settings.ONLYOFFICE_PUBLIC_URL.rstrip("/")
        if not internal or internal == public:
            return url

        parsed_url = urlparse(url)
        parsed_public = urlparse(public)
        parsed_internal = urlparse(internal)
        if parsed_url.netloc == parsed_public.netloc:
            return urlunparse(parsed_url._replace(scheme=parsed_internal.scheme, netloc=parsed_internal.netloc))
        return url

    async def _replace_docx_atomically(self, target_path: Path, temp_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(temp_path, target_path)


onlyoffice_service = OnlyOfficeService()
