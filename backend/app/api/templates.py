from pathlib import Path

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from app.core.config import settings
from app.schemas.order import TemplateListResponse, TemplateVariablesResponse
from app.services.order_service import order_service
from app.utils.file_helpers import ORDER_TYPES

router = APIRouter(prefix="/templates", tags=["templates"])


def _get_current_user_stub() -> str:
    return "admin"


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    current_user: str = Depends(_get_current_user_stub),
):
    templates = order_service.list_all_templates()
    return {"templates": templates}


@router.get("/variables", response_model=TemplateVariablesResponse)
async def get_template_variables(
    current_user: str = Depends(_get_current_user_stub),
):
    variables = order_service.get_template_variables()
    return {"variables": variables}


@router.get("/{order_type}/preview", response_class=HTMLResponse)
async def preview_template(
    order_type: str,
    current_user: str = Depends(_get_current_user_stub),
):
    if order_type not in ORDER_TYPES:
        raise HTTPException(400, "Неверный тип приказа")

    from app.utils.file_helpers import get_template_filename
    filename = get_template_filename(order_type)
    if not filename:
        raise HTTPException(404, "Шаблон не найден")

    file_path = Path(settings.TEMPLATES_PATH) / filename
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    try:
        import mammoth
        with open(file_path, "rb") as docx_file:
            result = mammoth.convert_to_html(docx_file)
            html_content = result.value
        
        # Wrap in a styled HTML page
        full_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Превью: {order_type}</title>
            <style>
                body {{
                    font-family: 'Times New Roman', serif;
                    max-width: 800px;
                    margin: 20px auto;
                    padding: 20px;
                    background: #f5f5f5;
                }}
                .container {{
                    background: white;
                    padding: 40px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }}
                h1, h2, h3 {{
                    color: #333;
                }}
                p {{
                    line-height: 1.6;
                    color: #444;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                {html_content}
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=full_html)
    except Exception as e:
        raise HTTPException(500, f"Ошибка при конвертации: {str(e)}")


@router.get("/{order_type}")
async def download_template(
    order_type: str,
    current_user: str = Depends(_get_current_user_stub),
):
    if order_type not in ORDER_TYPES:
        raise HTTPException(400, "Неверный тип приказа")

    from app.utils.file_helpers import get_template_filename
    filename = get_template_filename(order_type)
    if not filename:
        raise HTTPException(404, "Шаблон не найден")

    file_path = Path(settings.TEMPLATES_PATH) / filename
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    return FileResponse(
        str(file_path),
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/{order_type}")
async def upload_template(
    order_type: str,
    file: UploadFile = File(...),
    current_user: str = Depends(_get_current_user_stub),
):
    if current_user != "admin":
        raise HTTPException(403, "Недостаточно прав")

    if order_type not in ORDER_TYPES:
        raise HTTPException(400, "Неверный тип приказа")

    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(400, "Только файлы .docx")

    from app.utils.file_helpers import get_template_filename
    filename = get_template_filename(order_type)
    if not filename:
        raise HTTPException(400, "Неверный тип приказа")

    file_path = Path(settings.TEMPLATES_PATH) / filename
    file_path.parent.mkdir(parents=True, exist_ok=True)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "status": "uploaded",
        "template": filename,
        "file_size": len(content),
    }


@router.put("/{order_type}")
async def update_template(
    order_type: str,
    file: UploadFile = File(...),
    current_user: str = Depends(_get_current_user_stub),
):
    if current_user != "admin":
        raise HTTPException(403, "Недостаточно прав")

    if order_type not in ORDER_TYPES:
        raise HTTPException(400, "Неверный тип приказа")

    if not file.filename or not file.filename.endswith(".docx"):
        raise HTTPException(400, "Только файлы .docx")

    from app.utils.file_helpers import get_template_filename
    filename = get_template_filename(order_type)
    if not filename:
        raise HTTPException(400, "Неверный тип приказа")

    file_path = Path(settings.TEMPLATES_PATH) / filename
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "status": "updated",
        "template": filename,
        "file_size": len(content),
    }


@router.delete("/{order_type}")
async def delete_template(
    order_type: str,
    current_user: str = Depends(_get_current_user_stub),
):
    if current_user != "admin":
        raise HTTPException(403, "Недостаточно прав")

    if order_type not in ORDER_TYPES:
        raise HTTPException(400, "Неверный тип приказа")

    from app.utils.file_helpers import get_template_filename
    filename = get_template_filename(order_type)
    if not filename:
        raise HTTPException(400, "Неверный тип приказа")

    file_path = Path(settings.TEMPLATES_PATH) / filename
    if not file_path.exists():
        raise HTTPException(404, "Шаблон не найден")

    file_path.unlink()

    return {
        "status": "deleted",
        "template": filename,
    }
