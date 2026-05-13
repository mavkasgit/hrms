import os
from pathlib import Path
from urllib.parse import quote
from urllib.parse import urlparse, urlunparse

import httpx
from jose import jwt

from app.core.config import settings
from app.core.exceptions import HRMSException


class OrderPrintService:
    PDF_MEDIA_TYPE = "application/pdf"

    def _cache_dir(self) -> Path:
        cache_dir = Path(settings.ORDERS_PATH) / ".print_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir

    def _onlyoffice_base_url_candidates(self) -> list[str]:
        candidates: list[str] = []
        for url in (settings.ONLYOFFICE_INTERNAL_URL, settings.ONLYOFFICE_PUBLIC_URL):
            normalized = (url or "").rstrip("/")
            if normalized and normalized not in candidates:
                candidates.append(normalized)
        return candidates

    def _source_file_url(self, order_id: int) -> str:
        base_url = (settings.BACKEND_INTERNAL_CALLBACK_URL or settings.APP_PUBLIC_URL).rstrip("/")
        return f"{base_url}/api/orders/{order_id}/onlyoffice/file"

    def _cache_key(self, order_id: int, docx_path: Path) -> str:
        mtime = int(docx_path.stat().st_mtime)
        return f"order-{order_id}-{mtime}"

    def _cache_file_path(self, cache_key: str) -> Path:
        return self._cache_dir() / f"{cache_key}.pdf"

    def _cleanup_old_cache_files(self, order_id: int, keep_file: Path) -> None:
        for candidate in self._cache_dir().glob(f"order-{order_id}-*.pdf"):
            if candidate == keep_file:
                continue
            try:
                candidate.unlink(missing_ok=True)
            except OSError:
                continue

    async def get_or_create_pdf(self, order_id: int, docx_path: Path) -> Path:
        if not docx_path.exists():
            raise HRMSException("Файл приказа отсутствует на диске", "order_file_missing", status_code=404)

        cache_key = self._cache_key(order_id, docx_path)
        cache_file = self._cache_file_path(cache_key)
        if cache_file.exists():
            return cache_file

        converted_url = await self._convert_docx_to_pdf(order_id, docx_path, cache_key)
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
        self._cleanup_old_cache_files(order_id, keep_file=cache_file)
        return cache_file

    async def _convert_docx_to_pdf(self, order_id: int, docx_path: Path, cache_key: str) -> str:
        payload = {
            "async": False,
            "filetype": "docx",
            "key": cache_key,
            "outputtype": "pdf",
            "title": docx_path.name,
            "url": self._source_file_url(order_id),
            "documentLayout": {"isPrint": True},
        }
        token = jwt.encode(payload, settings.ONLYOFFICE_JWT_SECRET, algorithm="HS256")
        signed_payload = {**payload, "token": token}

        last_error: Exception | None = None
        for base_url in self._onlyoffice_base_url_candidates():
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
        download_urls = [self._normalize_download_url(file_url)]
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


order_print_service = OrderPrintService()
