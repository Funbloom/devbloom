DevBloom Local Agent — artist install (Windows)
================================================

The Local Agent runs on your PC so DevBloom Studio can open folders on your machine
and read/write project files safely (127.0.0.1 only).

Prerequisites
-------------
- Windows 10/11
- Python 3.10 or newer (https://www.python.org/downloads/)
  Check "Add python.exe to PATH" during install.

One-time setup
--------------
1. Unzip this folder anywhere (e.g. Downloads\DevBloomLocalAgent).
2. Double-click install.bat and wait until it says "Installation complete."
3. Open DevBloom Studio → Settings → Installation → click "Start Local Agent."

Every day
---------
- Open DevBloom Studio in your browser.
- Settings → Installation → "Start Local Agent" (or double-click run.bat in
  %LOCALAPPDATA%\DevBloom\LocalAgent).
- Keep the agent window open while you work.

Install location
----------------
Files are copied to: %LOCALAPPDATA%\DevBloom\LocalAgent

Optional (advanced)
-------------------
- SAM / Mesh Gen: see DevBloom developer docs; not included in this base package.
- CORS for https://dev.funbloomstudio.com is set automatically by install.bat.
