from __future__ import annotations

import re
from typing import List, Optional

from services.planning.planning_import_pkg.planning_import_mapper import build_import_data

FIELD_PATTERNS = {
    "game": re.compile(r"^Game:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "milestone": re.compile(r"^Milestone:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "start_date": re.compile(r"^Start date:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
    "delivery_date": re.compile(r"^Delivery date:\s*(.+)$", re.IGNORECASE | re.MULTILINE),
}

TABLE_HEADER_RE = re.compile(r"Objective.*Deliverable.*Status", re.IGNORECASE)
STATUS_TOKEN_RE = re.compile(
    r"^(Completed|Ready|In Progress|In progress|Not Started|Todo|To Do)$",
    re.IGNORECASE,
)

TABLE_HEADER_OBJECTIVE_RE = re.compile(r"^objective$", re.IGNORECASE)


def _first_match(pattern: re.Pattern[str], text: str) -> Optional[str]:
    match = pattern.search(text)
    if not match:
        return None
    return match.group(1).strip()


def _extract_goals(section: str) -> List[str]:
    goals: List[str] = []
    goals_match = re.search(r"^Goals:\s*$", section, re.IGNORECASE | re.MULTILINE)
    if not goals_match:
        return goals
    after = section[goals_match.end() :]
    for line in after.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if TABLE_HEADER_RE.search(stripped) or stripped.lower().startswith("objective"):
            break
        bullet = re.sub(r"^[●•\-]\s*", "", stripped)
        if bullet:
            goals.append(bullet)
    return goals


def _parse_table_rows(section: str) -> List[dict]:
    rows: List[dict] = []
    lines = section.splitlines()
    header_idx = -1
    for idx, line in enumerate(lines):
        if TABLE_HEADER_RE.search(line) or (
            "objective" in line.lower() and "deliverable" in line.lower() and "status" in line.lower()
        ):
            header_idx = idx
            break
    if header_idx < 0:
        return rows

    data_lines = [ln.strip() for ln in lines[header_idx + 1 :] if ln.strip()]
    idx = 0
    while idx < len(data_lines):
        line = data_lines[idx]
        if re.match(r"^(Milestone:|Project Status|Game:)", line, re.IGNORECASE):
            break

        if "\t" in line:
            parts = [p.strip() for p in line.split("\t")]
            while len(parts) < 6:
                parts.append("")
            if TABLE_HEADER_OBJECTIVE_RE.match(parts[0]):
                idx += 1
                continue
            rows.append(
                {
                    "objective": parts[0],
                    "deliverable": parts[1],
                    "status": parts[2],
                    "risk": parts[3],
                    "owner": parts[4],
                    "due_date": parts[5],
                    "tab_row": True,
                }
            )
            idx += 1
            continue

        objective = line
        deliverable_lines: List[str] = []
        idx += 1
        status = ""
        risk = ""
        owner = ""
        due_date = ""
        while idx < len(data_lines):
            current = data_lines[idx]
            if STATUS_TOKEN_RE.match(current):
                status = current
                idx += 1
                if idx < len(data_lines) and not STATUS_TOKEN_RE.match(data_lines[idx]):
                    risk = data_lines[idx]
                    idx += 1
                if idx < len(data_lines) and not STATUS_TOKEN_RE.match(data_lines[idx]):
                    owner = data_lines[idx]
                    idx += 1
                if idx < len(data_lines) and not STATUS_TOKEN_RE.match(data_lines[idx]):
                    due_date = data_lines[idx]
                    idx += 1
                break
            if re.match(r"^(Milestone:|Project Status|Game:)", current, re.IGNORECASE):
                break
            deliverable_lines.append(current)
            idx += 1

        rows.append(
            {
                "objective": objective,
                "deliverable": "\n".join(deliverable_lines),
                "status": status,
                "risk": risk,
                "owner": owner,
                "due_date": due_date,
            }
        )
    return rows


def _split_milestone_sections(text: str) -> List[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    parts = re.split(r"(?im)^Milestone:\s*", normalized)
    sections: List[str] = []
    for idx, part in enumerate(parts):
        chunk = part.strip()
        if not chunk:
            continue
        if idx == 0:
            if re.search(r"(?im)^Milestone:\s*", normalized):
                continue
            if "milestone:" not in chunk.lower():
                continue
        sections.append(f"Milestone: {chunk}" if idx > 0 else chunk)
    if not sections:
        sections = [normalized]
    return sections


def parse_planning_text(text: str) -> tuple:
    project_name = _first_match(FIELD_PATTERNS["game"], text)
    milestone_raws: List[dict] = []
    for section in _split_milestone_sections(text):
        name = _first_match(FIELD_PATTERNS["milestone"], section)
        if not name and "Milestone:" not in section:
            continue
        milestone_raws.append(
            {
                "name": name or "",
                "start_date": _first_match(FIELD_PATTERNS["start_date"], section),
                "delivery_date": _first_match(FIELD_PATTERNS["delivery_date"], section),
                "goals": _extract_goals(section),
                "table_rows": _parse_table_rows(section),
            }
        )
    return build_import_data(project_name, milestone_raws)
