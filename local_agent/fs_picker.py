"""Folder/file dialogs for the local agent: AppleScript on macOS, tkinter elsewhere."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import Sequence


def _escape_applescript_string(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def _run_osascript(script: str) -> str:
    proc = subprocess.run(
        ["osascript", "-e", script],
        capture_output=True,
        text=True,
        timeout=3600,
    )
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "").strip() or f"osascript exit {proc.returncode}"
        raise RuntimeError(msg)
    return proc.stdout.strip()


def _pick_directory_macos(title: str) -> str | None:
    esc = _escape_applescript_string(title)
    script = f"""try
    set theFolder to choose folder with prompt "{esc}"
    return POSIX path of theFolder
on error number -128
    return ""
end try"""
    path = _run_osascript(script)
    if not path:
        return None
    return str(Path(path).resolve())


def _extensions_from_filetypes(filetypes: Sequence[tuple[str, str]] | None) -> list[str]:
    if not filetypes:
        return []
    out: list[str] = []
    for _name, pattern in filetypes:
        for part in pattern.split():
            if part.startswith("*."):
                out.append(part[2:].lstrip("."))
    return out


def _pick_file_macos(title: str, filetypes: Sequence[tuple[str, str]] | None) -> str | None:
    esc = _escape_applescript_string(title)
    exts = _extensions_from_filetypes(filetypes)
    if exts:
        types_list = "{" + ", ".join(f'"{e}"' for e in exts) + "}"
        inner = f"set theFile to choose file of type {types_list} with prompt \"{esc}\""
    else:
        inner = f'set theFile to choose file with prompt "{esc}"'
    script = f"""try
    {inner}
    return POSIX path of theFile
on error number -128
    return ""
end try"""
    path = _run_osascript(script)
    if not path:
        return None
    return str(Path(path).resolve())


def pick_directory_native(title: str = "Choose project folder") -> str | None:
    """Block until the user picks a folder or cancels. Returns absolute path or None if cancelled."""
    if sys.platform == "darwin":
        return _pick_directory_macos(title)

    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    try:
        path = filedialog.askdirectory(mustexist=True, title=title)
    finally:
        root.destroy()
    if not path:
        return None
    return str(Path(path).resolve())


def pick_file_native(
    title: str = "Choose file",
    filetypes: Sequence[tuple[str, str]] | None = None,
) -> str | None:
    """Block until the user picks a file or cancels. Returns absolute path or None if cancelled.

    filetypes: tkinter format, e.g. [("Images", "*.png *.jpg *.jpeg"), ("All", "*.*")]
    """
    if sys.platform == "darwin":
        return _pick_file_macos(title, filetypes)

    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    try:
        root.attributes("-topmost", True)
    except tk.TclError:
        pass
    ft = list(filetypes) if filetypes else [("All files", "*.*")]
    try:
        path = filedialog.askopenfilename(title=title, filetypes=ft)
    finally:
        root.destroy()
    if not path:
        return None
    return str(Path(path).resolve())
