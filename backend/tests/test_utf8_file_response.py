import urllib.parse
from pathlib import Path
import tempfile
from app.api.orders import UTF8FileResponse

def test_utf8_file_response_adds_extension():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"dummy")
        temp_path = Path(f.name)
    
    try:
        # 1. Filename without extension
        filename_no_ext = "Приказ (групповой, 4 сотр.)"
        response = UTF8FileResponse(path=temp_path, filename=filename_no_ext)
        
        # Check that utf8_filename has .docx appended
        assert response.utf8_filename == "Приказ (групповой, 4 сотр.).docx"
        
        # Check headers
        headers_dict = dict(response.raw_headers)
        cd_header = headers_dict.get(b"content-disposition", b"").decode("utf-8")
        
        # Filename parameter should have double quotes around the sanitized and extended name
        assert 'filename="Приказ (групповой, 4 сотр.).docx"' in cd_header
        
        # Filename* parameter should be encoded properly without quotes
        expected_encoded = urllib.parse.quote("Приказ (групповой, 4 сотр.).docx")
        assert f"filename*=UTF-8''{expected_encoded}" in cd_header
        
    finally:
        if temp_path.exists():
            temp_path.unlink()

def test_utf8_file_response_keeps_extension_and_escapes_quotes():
    with tempfile.NamedTemporaryFile(delete=False) as f:
        f.write(b"dummy")
        temp_path = Path(f.name)
    
    try:
        # 2. Filename with extension and double quotes
        filename_with_quotes = 'Приказ "Особый" от 01.01.2026.docx'
        response = UTF8FileResponse(path=temp_path, filename=filename_with_quotes)
        
        # Check that utf8_filename keeps .docx and double quotes are replaced with single quotes
        assert response.utf8_filename == "Приказ 'Особый' от 01.01.2026.docx"
        
        # Check headers
        headers_dict = dict(response.raw_headers)
        cd_header = headers_dict.get(b"content-disposition", b"").decode("utf-8")
        
        assert 'filename="Приказ \'Особый\' от 01.01.2026.docx"' in cd_header
        
    finally:
        if temp_path.exists():
            temp_path.unlink()
