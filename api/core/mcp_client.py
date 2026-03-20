"""
MCP (Model Context Protocol) client for the app's agents.
Supports Cursor-style multi-server config (JSON with mcpServers) or legacy env:
  - Config file: MCP_CONFIG_PATH or .cursor/mcp.json or api/mcp_servers.json
  - Legacy env: MCP_SERVER_URL (SSE) or MCP_SERVER_COMMAND + MCP_SERVER_ARGS (stdio)
Tool names from config are prefixed so calls are routed to the right server (e.g. mcp__jira-server__get_issue).
"""

import asyncio
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Run async code from sync when we may already be inside an event loop (e.g. FastAPI lifespan).
__executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="mcp_tools")


def _run_async(coro: Any) -> Any:
    """Run coroutine from sync code. Uses a thread with asyncio.run() if there's already a running loop."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    future = __executor.submit(asyncio.run, coro)
    return future.result()

# Cache: list of OpenAI-format tools (with prefixed names when using multi-server)
_MCP_TOOLS_CACHE: Optional[list[dict]] = None

# Prefix for multi-server tool names: mcp__{server_name}__{tool_name}
_MCP_TOOL_PREFIX = "mcp__"


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _get_mcp_config_path() -> Optional[Path]:
    """Path to Cursor-style MCP config file, or None if not found."""
    explicit = os.getenv("MCP_CONFIG_PATH", "").strip()
    if explicit:
        p = Path(explicit)
        if p.is_absolute():
            return p if p.exists() else None
        return (_project_root() / p).resolve() if (_project_root() / p).exists() else None
    for candidate in [
        _project_root() / ".cursor" / "mcp.json",
        _project_root() / "mcp_servers.json",
    ]:
        if candidate.exists():
            return candidate
    return None


def _resolve_env_value(val: str) -> str:
    """Replace ${VAR} and $VAR with os.environ values. Leaves unknown vars as-is or empty."""
    if not isinstance(val, str):
        return val

    def repl(m: re.Match) -> str:
        key = m.group(1) or m.group(2)
        return os.environ.get(key, "")

    return re.sub(r"\$\{(\w+)\}|\$(\w+)", repl, val)


def _resolve_env_dict(env: dict[str, str]) -> dict[str, str]:
    """Resolve ${VAR} in values and merge with current process env (for stdio child)."""
    base = dict(os.environ)
    for k, v in (env or {}).items():
        base[k] = _resolve_env_value(v) if isinstance(v, str) else str(v)
    return base


def _load_cursor_style_config() -> Optional[dict[str, dict]]:
    """
    Load Cursor-style config: { "mcpServers": { "serverName": { "url" | "type", "command", "args", "env" }, ... } }.
    Returns dict server_name -> server_config, or None if not using config.
    """
    path = _get_mcp_config_path()
    if not path:
        return None
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
    except (OSError, json.JSONDecodeError):
        return None
    servers = data.get("mcpServers") if isinstance(data, dict) else None
    if not servers or not isinstance(servers, dict):
        return None
    result = {}
    for name, raw in servers.items():
        if not isinstance(raw, dict):
            continue
        # SSE: has "url"
        if "url" in raw and raw["url"]:
            result[name] = {"url": _resolve_env_value(str(raw["url"]).strip())}
            continue
        # Stdio: "type": "stdio" or has "command"
        if raw.get("type") == "stdio" or "command" in raw:
            cmd = (raw.get("command") or "").strip()
            if not cmd:
                continue
            args = raw.get("args")
            if not isinstance(args, list):
                args = []
            args = [str(a) for a in args]
            env = raw.get("env")
            if isinstance(env, dict):
                env = _resolve_env_dict(env)
            else:
                env = dict(os.environ)
            result[name] = {"type": "stdio", "command": cmd, "args": args, "env": env}
    return result if result else None


def _get_legacy_config() -> tuple[Optional[str], Optional[str], Optional[list[str]], Optional[dict]]:
    """Legacy: (url, command, args, env). At most one of (url) or (command, args) set. env only for stdio."""
    url = os.getenv("MCP_SERVER_URL", "").strip() or None
    cmd = os.getenv("MCP_SERVER_COMMAND", "").strip() or None
    args_str = os.getenv("MCP_SERVER_ARGS", "").strip()
    args: Optional[list[str]] = None
    if args_str:
        try:
            args = json.loads(args_str)
        except json.JSONDecodeError:
            args = [a.strip() for a in args_str.split(",") if a.strip()]
    if cmd and not args:
        args = []
    if url and cmd:
        url = None
    env = None  # legacy env doesn't pass custom env to stdio
    if url:
        return (url, None, None, None)
    if cmd:
        return (None, cmd, args, env)
    return (None, None, None, None)


def _mcp_tool_to_openai(tool: Any, prefix: Optional[str] = None) -> dict:
    """Convert MCP tool to OpenAI function tool format. If prefix is set, prepend to name."""
    name = getattr(tool, "name", None) or "unknown"
    if prefix:
        name = f"{_MCP_TOOL_PREFIX}{prefix}__{name}"
    description = getattr(tool, "description", None) or ""
    schema = getattr(tool, "input_schema", None) or getattr(tool, "inputSchema", None)
    if schema is None:
        schema = {}
    if hasattr(schema, "model_dump"):
        schema = schema.model_dump()
    if not isinstance(schema, dict):
        schema = {}
    params = {
        "type": schema.get("type", "object"),
        "properties": schema.get("properties") or {},
        "required": schema.get("required") or [],
    }
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": (description or f"MCP tool: {name}")[:500],
            "parameters": params,
        },
    }


async def _list_tools_single_async(
    *,
    url: Optional[str] = None,
    command: Optional[str] = None,
    args: Optional[list[str]] = None,
    env: Optional[dict[str, str]] = None,
    server_prefix: Optional[str] = None,
) -> list[dict]:
    """List tools from one server. Exactly one of url or command must be set."""
    try:
        from mcp import ClientSession
    except ImportError:
        return []

    if url:
        from mcp.client.sse import sse_client
        async with sse_client(url) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                response = await session.list_tools()
                tools = getattr(response, "tools", []) or []
                server_label = server_prefix or "mcp"
                for t in tools:
                    tool_name = getattr(t, "name", None) or "unknown"
                    logger.info("MCP tool loaded: %s:%s", server_label, tool_name)
                return [_mcp_tool_to_openai(t, server_prefix) for t in tools]

    if command is not None:
        from mcp import StdioServerParameters
        from mcp.client.stdio import stdio_client
        params = StdioServerParameters(
            command=command,
            args=args or [],
            env=env if env is not None else os.environ,
        )
        async with stdio_client(params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                response = await session.list_tools()
                tools = getattr(response, "tools", []) or []
                server_label = server_prefix or "mcp"
                for t in tools:
                    tool_name = getattr(t, "name", None) or "unknown"
                    logger.info("MCP tool loaded: %s:%s", server_label, tool_name)
                return [_mcp_tool_to_openai(t, server_prefix) for t in tools]

    return []


async def _call_tool_single_async(
    tool_name: str,
    arguments: dict,
    *,
    url: Optional[str] = None,
    command: Optional[str] = None,
    args: Optional[list[str]] = None,
    env: Optional[dict[str, str]] = None,
) -> str:
    """Call one tool on one server. Exactly one of url or command must be set."""
    from mcp import ClientSession

    args_list = arguments if isinstance(arguments, dict) else (arguments or {})

    if url:
        from mcp.client.sse import sse_client
        async with sse_client(url) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, args_list)
    else:
        from mcp import StdioServerParameters
        from mcp.client.stdio import stdio_client
        params = StdioServerParameters(
            command=command or "",
            args=args or [],
            env=env if env is not None else os.environ,
        )
        async with stdio_client(params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, args_list)

    content = getattr(result, "content", None)
    if content is None:
        return json.dumps({"result": str(result)})
    if isinstance(content, list):
        parts = []
        for part in content:
            if hasattr(part, "text"):
                parts.append(part.text)
            elif isinstance(part, dict) and "text" in part:
                parts.append(part["text"])
            else:
                parts.append(str(part))
        return "\n".join(parts) if parts else json.dumps({"result": str(result)})
    if isinstance(content, str):
        return content
    return json.dumps(content)


def _parse_prefixed_name(name: str) -> Optional[tuple[str, str]]:
    """If name is mcp__server__tool return (server, tool); else None."""
    if not name.startswith(_MCP_TOOL_PREFIX):
        return None
    rest = name[len(_MCP_TOOL_PREFIX) :]
    if "__" not in rest:
        return None
    server_name, base_name = rest.split("__", 1)
    return (server_name, base_name) if server_name and base_name else None


async def _list_tools_async() -> list[dict]:
    """List all MCP tools (multi-server or legacy). Returns OpenAI-format list."""
    config = _load_cursor_style_config()
    if config:
        all_tools: list[dict] = []
        for server_name, server_cfg in config.items():
            if "url" in server_cfg:
                tools = await _list_tools_single_async(
                    url=server_cfg["url"],
                    server_prefix=server_name,
                )
            else:
                tools = await _list_tools_single_async(
                    command=server_cfg.get("command"),
                    args=server_cfg.get("args"),
                    env=server_cfg.get("env"),
                    server_prefix=server_name,
                )
            all_tools.extend(tools)
        return all_tools

    # Legacy single server
    url, command, args, env = _get_legacy_config()
    if not url and not command:
        return []
    return await _list_tools_single_async(
        url=url,
        command=command,
        args=args,
        env=env,
        server_prefix=None,
    )


async def _call_tool_async(name: str, arguments: dict) -> str:
    """Call MCP tool by (possibly prefixed) name."""
    config = _load_cursor_style_config()
    if config:
        parsed = _parse_prefixed_name(name)
        if not parsed:
            return json.dumps({"error": f"Unknown MCP tool or invalid name: {name}"})
        server_name, base_tool_name = parsed
        if server_name not in config:
            return json.dumps({"error": f"MCP server not in config: {server_name}"})
        server_cfg = config[server_name]
        if "url" in server_cfg:
            return await _call_tool_single_async(
                base_tool_name,
                arguments,
                url=server_cfg["url"],
            )
        return await _call_tool_single_async(
            base_tool_name,
            arguments,
            command=server_cfg.get("command"),
            args=server_cfg.get("args"),
            env=server_cfg.get("env"),
        )

    # Legacy single server
    url, command, args, env = _get_legacy_config()
    if not url and not command:
        return json.dumps({"error": "MCP server not configured."})
    try:
        from mcp import ClientSession
    except ImportError:
        return json.dumps({"error": "mcp package not installed."})
    return await _call_tool_single_async(
        name,
        arguments if isinstance(arguments, dict) else (arguments or {}),
        url=url,
        command=command,
        args=args,
        env=env,
    )


def get_mcp_tools_openai() -> list[dict]:
    """Return cached list of MCP tools in OpenAI format (prefixed when using multi-server)."""
    global _MCP_TOOLS_CACHE
    if _MCP_TOOLS_CACHE is not None:
        return _MCP_TOOLS_CACHE
    config = _load_cursor_style_config()
    if config:
        try:
            _MCP_TOOLS_CACHE = _run_async(_list_tools_async())
            return _MCP_TOOLS_CACHE or []
        except Exception:
            return []
    url, command, _, _ = _get_legacy_config()
    if not url and not command:
        return []
    try:
        _MCP_TOOLS_CACHE = _run_async(_list_tools_async())
        return _MCP_TOOLS_CACHE or []
    except Exception:
        return []


def call_mcp_tool(name: str, arguments: dict) -> str:
    """Call an MCP tool by name (use prefixed name e.g. mcp__jira-server__get_issue when using config)."""
    try:
        return _run_async(_call_tool_async(name, arguments))
    except Exception as e:
        return json.dumps({"error": str(e)})


def is_mcp_configured() -> bool:
    """True if MCP is configured via config file or legacy env."""
    if _load_cursor_style_config():
        return True
    url, cmd, _, _ = _get_legacy_config()
    return bool(url or cmd)
