import os
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import httpx
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException
from app.core.onlyoffice_net import public_api_url
from app.services.onlyoffice_service import (
    normalize_download_url,
    onlyoffice_base_url_candidates,
)

EntityKind = Literal["order", "notification", "statement"]


class OrderPrintService:
    PDF_MEDIA_TYPE = "application/pdf"

    def _cache_dir(self) -> Path:
        cache_dir = Path(settings.ORDERS_PATH) / ".print_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _source_file_url(self, entity_kind: EntityKind, entity_id: int) -> str:
        return public_api_url(f"/{entity_kind}s/{entity_id}/onlyoffice/file")

    def _cache_key(self, entity_kind: EntityKind, entity_id: int, docx_path: Path) -> str:
        mtime = int(docx_path.stat().st_mtime)
        return f"{entity_kind}-{entity_id}-{mtime}"

    def _cache_file_path(self, cache_key: str) -> Path:
        return self._cache_dir() / f"{cache_key}.pdf"

    def _cleanup_old_cache_files(self, entity_kind: EntityKind, entity_id: int, keep_file: Path) -> None:
        for candidate in self._cache_dir().glob(f"{entity_kind}-{entity_id}-*.pdf"):
            if candidate == keep_file:
                continue
            try:
                candidate.unlink(missing_ok=True)
            except OSError:
                continue

    async def get_or_create_pdf(self, entity_kind: EntityKind, entity_id: int, docx_path: Path) -> Path:
        if not docx_path.exists():
            raise HRMSException("Файл документа отсутствует на диске", "document_file_missing", status_code=404)

        cache_key = self._cache_key(entity_kind, entity_id, docx_path)
        cache_file = self._cache_file_path(cache_key)
        if cache_file.exists():
            return cache_file

        converted_url = await self._convert_docx_to_pdf(entity_kind, entity_id, docx_path, cache_key)
        pdf_bytes = await self._download_pdf(converted_url)

        temp_file = cache_file.with_name(f".{cache_file.name}.tmp")
        try:
            temp_file.write_bytes(pdf_bytes)
            os.replace(temp_file, cache_file)
        except OSError as exc:
            if temp_file.exists():
                temp_file.unlink(missing_ok=True)
            raise HRMSException(
                f"Не удалось сохранить PDF приказа на диск: {exc}",
                "order_pdf_write_failed",
                status_code=500,
            ) from exc
        self._cleanup_old_cache_files(entity_kind, entity_id, keep_file=cache_file)
        return cache_file

    async def _convert_docx_to_pdf(self, entity_kind: EntityKind, entity_id: int, docx_path: Path, cache_key: str) -> str:
        payload = {
            "async": False,
            "filetype": "docx",
            "key": cache_key,
            "outputtype": "pdf",
            "title": docx_path.name,
            "url": self._source_file_url(entity_kind, entity_id),
            "documentLayout": {"isPrint": True},
        }
        token = jwt.encode(payload, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        signed_payload = {**payload, "token": token}

        last_error: Exception | None = None
        for base_url in onlyoffice_base_url_candidates():
            converter_url = f"{base_url}/converter?shardkey={quote(cache_key)}"
            try:
                async with httpx.AsyncClient(timeout=settings.DOCUMENT_GENERATION_TIMEOUT) as client:
                    response = await client.post(
                        converter_url,
                        json=signed_payload,
                        headers={
                            "Accept": "application/json",
                            "Authorization": f"Bearer {token}",
                        },
                    )
                    response.raise_for_status()
                result = response.json()
            except Exception as exc:
                last_error = exc
                continue

            error_code = result.get("error")
            if error_code not in (None, 0):
                raise HRMSException(
                    f"OnlyOffice вернул ошибку конвертации: {error_code}",
                    "order_pdf_convert_failed",
                    status_code=502,
                )

            if result.get("endConvert") is not True or not result.get("fileUrl"):
                raise HRMSException(
                    "OnlyOffice не завершил конвертацию документа в PDF",
                    "order_pdf_convert_incomplete",
                    status_code=502,
                )

            return str(result["fileUrl"])

        raise HRMSException(
            f"Не удалось запросить конвертацию PDF в OnlyOffice: {last_error}",
            "order_pdf_convert_failed",
            status_code=502,
        )

    async def _download_pdf(self, file_url: str) -> bytes:
        download_urls = [normalize_download_url(file_url)]
        if file_url not in download_urls:
            download_urls.append(file_url)

        last_error: Exception | None = None
        for candidate in download_urls:
            try:
                async with httpx.AsyncClient(timeout=settings.DOCUMENT_GENERATION_TIMEOUT) as client:
                    response = await client.get(candidate)
                    response.raise_for_status()
                return response.content
            except Exception as exc:
                last_error = exc
                continue

        raise HRMSException(
            f"Не удалось скачать сконвертированный PDF из OnlyOffice: {last_error}",
            "order_pdf_download_failed",
            status_code=502,
        )


order_print_service = OrderPrintService()
