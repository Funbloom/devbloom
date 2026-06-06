from __future__ import annotations

import io
import re
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from fastapi import HTTPException
from pypdf import PdfReader

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}
MAX_IMPORT_BYTES = 10 * 1024 * 1024


def _extension(filename: str) -> str:
    return Path((filename or "").strip()).suffix.lower()


def validate_import_file(filename: str, file_bytes: bytes) -> str:
    ext = _extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or 'unknown'}'. Use PDF, DOCX, TXT, or Markdown.",
        )
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB import limit.")
    return ext


def extract_pdf_text(file_bytes: bytes) -> str:
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages: list[str] = []
        for page in reader.pages:
            text = page.extract_text() or ""
            if text.strip():
                pages.append(text)
        return "\n\n".join(pages).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {exc}") from exc


def _normalize_glued_planning_line(line: str) -> str:
    if re.search(r"(?i)Milestone:\s*.+Delivery date:", line):
        line = re.sub(r"(?i)(Delivery date:)", r"\n\1", line)
    return line


def _docx_paragraph_text(element) -> str:
    texts = [node.text for node in element.iter(qn("w:t")) if node.text]
    return "".join(texts).strip()


def _docx_table_row_lines(element) -> list[str]:
    rows: list[str] = []
    for row in element.findall(".//" + qn("w:tr")):
        cells: list[str] = []
        for cell in row.findall(qn("w:tc")):
            cells.append(_docx_paragraph_text(cell))
        if any(cells):
            rows.append("\t".join(cells))
    return rows


def extract_docx_text(file_bytes: bytes) -> str:
    try:
        document = Document(io.BytesIO(file_bytes))
        parts: list[str] = []
        for child in document.element.body:
            tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
            if tag == "p":
                line = _docx_paragraph_text(child)
                if line:
                    parts.append(_normalize_glued_planning_line(line))
            elif tag == "tbl":
                parts.extend(_docx_table_row_lines(child))
        return "\n".join(parts).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read DOCX: {exc}") from exc


def extract_text(file_bytes: bytes, filename: str) -> str:
    ext = validate_import_file(filename, file_bytes)
    if ext == ".pdf":
        text = extract_pdf_text(file_bytes)
    elif ext == ".docx":
        text = extract_docx_text(file_bytes)
    else:
        try:
            text = file_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise HTTPException(status_code=400, detail="Text file must be UTF-8 encoded.") from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="No readable text found in file.")
    return text
