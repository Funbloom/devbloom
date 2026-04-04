"""SSE chat stream: RAG context, tool loop, OpenAI streaming."""

from __future__ import annotations

import json
import logging
import traceback
from datetime import datetime
from typing import Any, AsyncGenerator

from openai import OpenAI

from core.app_paths import DEBUG_PROMPTS_PATH
from core.chat_debug import log_debug_error, log_unexpected_path
from core.chat_helpers import (
    _choose_tool_name,
    _extract_tool_args,
    _user_might_need_tools,
    normalize_agent_id,
)
from core.chat_schemas import ChatMessage, ChatRequest, RagOptions
from core.code_settings import GPT_MODEL_DEFAULT
from core.llm_tools import BUILTIN_TOOL_NAMES, get_tools
from core.skills_loader import build_available_skills_xml, get_skill_content
from core.sse_utils import sse_event
from core.personas import load_persona_description_prompt, load_persona_text
from services.docx_export import run_export_docx_tool
from services.image_tool import (
    run_convert_image_tool,
    run_crop_image_tool,
    run_generate_image_tool,
    run_resize_image_tool,
)
from services.pdf_export import get_gen_output_dir, run_export_pdf_tool
from services.rag import (
    get_default_project_key_value,
    get_project_display_name,
    get_supabase_client,
    retrieve_chunks,
    resolve_scope_and_project_key,
)
from services.xlsx_jobs import enqueue_xlsx_job

try:
    from core.mcp_client import call_mcp_tool
except ImportError:
    call_mcp_tool = None

logger = logging.getLogger(__name__)

AGENT_HISTORIES: dict[str, list[ChatMessage]] = {}


async def chat_stream_generator(body: ChatRequest, client: OpenAI) -> AsyncGenerator[bytes, None]:
    try:
        agent_id = normalize_agent_id(body.agent)
        persona_text = load_persona_text(agent_id)
        persona_description = load_persona_description_prompt(agent_id)
        persona_prompt = ""
        if persona_text:
            persona_prompt = (
                "*** PERSONA ***\n"
                "The agent represent this persona:\n"
                f"{persona_text}"
            )

        current_project_name = "Unspecified"
        project_key_for_prompt = ""
        if body.rag and body.rag.project_key:
            supabase = get_supabase_client()
            resolved_name = get_project_display_name(supabase, body.rag.project_key)
            if resolved_name:
                current_project_name = resolved_name
            project_key_for_prompt = body.rag.project_key
        persona_prompt = (
            persona_prompt
            + "\n*** PROJECT ***\nThe current game project is called "
            + current_project_name
            + ("." if not project_key_for_prompt else f". And the game project key is {project_key_for_prompt}.")
        )

        rag_options = body.rag or RagOptions()
        retrieved: list = []
        sources_payload: list = []
        if body.messages:
            last_user = next((m for m in reversed(body.messages) if m.role == "user"), None)
        else:
            last_user = None
        rag_query = body.message.strip() if body.message else (last_user.content if last_user else "")

        tool_project_key = get_default_project_key_value()
        if rag_query:
            try:
                agent_filter = rag_options.agent_ids
                if not agent_filter:
                    agent_filter = [rag_options.agent_id or agent_id]
                try:
                    rag_scope, rag_project_key = resolve_scope_and_project_key(
                        rag_options.scope,
                        rag_options.project_key,
                    )
                except Exception:
                    rag_scope, rag_project_key = "generic", None
                tool_project_key = rag_project_key or get_default_project_key_value()
                retrieved = retrieve_chunks(
                    rag_query,
                    rag_options.top_k,
                    rag_options.source_id,
                    agent_filter,
                    rag_scope,
                    rag_project_key or None,
                )
                if retrieved:
                    grouped: dict[str, dict] = {}
                    for item in retrieved:
                        key = str(item.source_id)
                        entry = grouped.setdefault(
                            key,
                            {
                                "source_id": key,
                                "title": item.title,
                                "chunks": [],
                                "scores": [],
                            },
                        )
                        entry["chunks"].append(item.chunk_index)
                        entry["scores"].append(item.score)
                    sources_payload = list(grouped.values())
            except Exception as exc:
                print(f"[rag] retrieval failed: {exc}")
                retrieved = []
                sources_payload = []

        context_block = ""
        if retrieved:
            formatted_chunks = [
                f"[Source: {item.title} | chunk {item.chunk_index}] {item.content}"
                for item in retrieved
            ]
            context_block = "CONTEXT:\n" + "\n\n".join(formatted_chunks)

        persona_prefix = persona_description or "You are a game development expert."
        rag_system_prompt = (
            f"{persona_prefix} "
            "Use provided context. If context is insufficient, say what is missing instead of inventing. "
            "When using context, prefer citing it. If the answer is not supported by context, "
            "say so and propose what to add to the KB."
        )
        tool_instruction = (
            "If the user explicitly requests saving or exporting to PDF or DOCX, "
            "produce the full document first with clear Markdown headings (e.g. '#', '##') and short sections, "
            "then call export_pdf or export_docx with the final content and a sensible title. "
            "If the user asks to create, save, or export a spreadsheet (xlsx, Excel), call export_xlsx with title and sheets (list of { name, rows }); rows are arrays of cell values. "
            "If the user did NOT request saving, do NOT call the tool. "
            "If the user asks to generate an image, call generate_image. "
            "If the user asks to resize, crop, or convert an existing image, call the matching tool. "
            "When the user's task matches an available skill, call load_skill with that skill's name to get full instructions, then follow them."
        )
        available_skills_block = build_available_skills_xml()
        if available_skills_block:
            tool_instruction = (
                tool_instruction + "\n\n"
                + available_skills_block + "\n\n"
                "Skill descriptions above define when to trigger; call load_skill(skill_name) when the user's task "
                "matches a skill's description to get full instructions, then follow them."
            )
            if tool_project_key:
                try:
                    gen_dir = get_gen_output_dir(tool_project_key)
                    tool_instruction = (
                        tool_instruction + "\n\n"
                        "Spreadsheet (xlsx) output directory for the current project: "
                        f"{gen_dir.resolve()}"
                    )
                except Exception:
                    logger.exception(
                        "Failed to resolve XLSX output directory for tool instruction.",
                        extra={"project_key": tool_project_key},
                    )

        use_history = body.message is not None and body.message.strip() != ""
        if use_history:
            history = AGENT_HISTORIES.setdefault(agent_id, [])
            history.append(ChatMessage(role="user", content=body.message.strip()))
            base_messages = [m.model_dump() for m in history]
        else:
            history = None
            base_messages = [m.model_dump() for m in body.messages]
        system_messages: list[dict] = [
            {"role": "system", "content": rag_system_prompt},
            {"role": "system", "content": tool_instruction},
        ]
        if persona_prompt:
            system_messages.append({"role": "system", "content": persona_prompt})
        if context_block:
            system_messages.append({"role": "system", "content": context_block})
        input_messages: list[dict[str, Any]] = [*system_messages, *base_messages]
        if body.debug_prompts:
            separator = "=" * 80
            timestamp = datetime.now().isoformat()
            user_text = body.message.strip() if body.message else (last_user.content if last_user else "")
            log_lines = [
                separator,
                f"Timestamp: {timestamp}",
                f"User: {user_text}",
                "Prompt:",
                *[msg.get("content", "") for msg in system_messages],
            ]
            DEBUG_PROMPTS_PATH.parent.mkdir(parents=True, exist_ok=True)
            with DEBUG_PROMPTS_PATH.open("a", encoding="utf-8") as handle:
                handle.write("\n".join(log_lines) + "\n")

        max_tool_iterations = 3
        tool_iterations = 0
        pending_messages = list(input_messages)
        user_text_for_tools = body.message.strip() if body.message else (last_user.content.strip() if last_user else "")
        use_tools_this_turn = _user_might_need_tools(user_text_for_tools)
        forced_tool_name = _choose_tool_name(user_text_for_tools)

        while tool_iterations < max_tool_iterations:
            assistant_chunks: list[str] = []
            tool_calls: list[dict[str, Any]] = []
            include_tools = use_tools_this_turn or tool_iterations > 0 or forced_tool_name is not None

            create_kwargs: dict[str, Any] = {
                "model": body.model or GPT_MODEL_DEFAULT,
                "messages": pending_messages,
                "stream": True,
            }
            create_kwargs["tools"] = get_tools()
            if include_tools:
                if forced_tool_name:
                    create_kwargs["tool_choice"] = {"type": "function", "function": {"name": forced_tool_name}}
                else:
                    create_kwargs["tool_choice"] = "required" if use_tools_this_turn else "auto"
            else:
                create_kwargs["tool_choice"] = "auto"

            stream = client.chat.completions.create(**create_kwargs)
            tool_call_map: dict[int, dict[str, Any]] = {}
            for chunk in stream:
                choice = chunk.choices[0]
                delta = choice.delta
                delta_text = getattr(delta, "content", None)
                if delta_text:
                    if history is not None:
                        assistant_chunks.append(delta_text)
                    yield sse_event("token", delta_text)
                delta_tool_calls = getattr(delta, "tool_calls", None)
                if delta_tool_calls:
                    for tool_call in delta_tool_calls:
                        index = tool_call.index
                        entry = tool_call_map.setdefault(
                            index,
                            {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {"name": "", "arguments": ""},
                            },
                        )
                        if tool_call.id and not entry.get("id"):
                            entry["id"] = tool_call.id
                        if tool_call.function and tool_call.function.name:
                            entry["function"]["name"] = tool_call.function.name
                        if tool_call.function and tool_call.function.arguments:
                            entry["function"]["arguments"] += tool_call.function.arguments
            tool_calls = [tool_call_map[i] for i in sorted(tool_call_map.keys())]

            assistant_text = "".join(assistant_chunks).strip()
            if history is not None and assistant_text:
                history.append(ChatMessage(role="assistant", content=assistant_text))

            if not tool_calls:
                if include_tools and forced_tool_name:
                    extracted = _extract_tool_args(assistant_text, forced_tool_name)
                    if extracted:
                        try:
                            if tool_project_key and not extracted.get("project_key"):
                                extracted["project_key"] = tool_project_key
                            if forced_tool_name == "generate_image":
                                result = run_generate_image_tool(extracted)
                                yield sse_event("image_generated", json.dumps(result))
                            elif forced_tool_name == "export_docx":
                                result = run_export_docx_tool(extracted)
                                yield sse_event("docx_saved", json.dumps(result))
                            elif forced_tool_name == "export_pdf":
                                result = run_export_pdf_tool(extracted)
                                yield sse_event("pdf_saved", json.dumps(result))
                            elif forced_tool_name == "export_xlsx":
                                job = enqueue_xlsx_job(extracted)
                                yield sse_event("xlsx_job", json.dumps({"job_id": job["id"]}))
                        except Exception as exc:
                            logger.exception(
                                "Forced fallback tool execution failed.",
                                extra={"forced_tool_name": forced_tool_name},
                            )
                            log_debug_error(
                                f"[tool_error] {forced_tool_name}",
                                "\n".join(
                                    [
                                        f"Args: {json.dumps(extracted, ensure_ascii=False)}",
                                        f"Error: {exc}",
                                        traceback.format_exc(),
                                    ]
                                ),
                            )
                            yield sse_event("error", str(exc))
                    else:
                        log_unexpected_path(
                            "Forced tool call was expected but the model returned no tool call or parseable fallback args.",
                            forced_tool_name=forced_tool_name,
                            assistant_text=assistant_text,
                        )
                    break
                break

            tool_iterations += 1
            allowed_tools = {
                "export_pdf": "pdf_saved",
                "export_docx": "docx_saved",
                "export_xlsx": "xlsx_saved",
                "generate_image": "image_generated",
                "resize_image": "image_updated",
                "crop_image": "image_updated",
                "convert_image": "image_updated",
                "load_skill": "skill_loaded",
            }
            all_tool_names = {t["function"]["name"] for t in get_tools()}
            for name in all_tool_names:
                if name not in allowed_tools:
                    allowed_tools[name] = "mcp_result"
            allowed_tool_calls = [
                call for call in tool_calls if call.get("function", {}).get("name") in allowed_tools
            ]
            if not allowed_tool_calls:
                first_call = tool_calls[0]
                tool_id = first_call.get("id") or "unknown_tool"
                tool_name = first_call.get("function", {}).get("name", "unknown_tool")
                error_payload = {"error": f"Tool '{tool_name}' is not allowed."}
                log_unexpected_path(
                    "Model attempted to call a tool that is not allowed.",
                    tool_name=tool_name,
                    available_tool_calls=[call.get("function", {}).get("name") for call in tool_calls],
                )
                yield sse_event("error", error_payload["error"])
                pending_messages.append(
                    {
                        "role": "assistant",
                        "content": assistant_text,
                        "tool_calls": [
                            {
                                "id": tool_id,
                                "type": "function",
                                "function": {
                                    "name": tool_name,
                                    "arguments": first_call.get("function", {}).get("arguments", "{}"),
                                },
                            }
                        ],
                    }
                )
                pending_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": tool_name,
                        "content": json.dumps(error_payload),
                    }
                )
                continue

            for call in allowed_tool_calls[:1]:
                tool_name = call.get("function", {}).get("name", "")
                tool_id = call.get("id") or tool_name or "tool"
                raw_args = call.get("function", {}).get("arguments", "{}")
                try:
                    parsed_args = json.loads(raw_args) if raw_args else {}
                    if tool_project_key and not parsed_args.get("project_key"):
                        parsed_args["project_key"] = tool_project_key
                    if tool_name == "export_pdf":
                        result = run_export_pdf_tool(parsed_args)
                        event_name = "pdf_saved"
                        event_payload = result
                    elif tool_name == "export_docx":
                        result = run_export_docx_tool(parsed_args)
                        event_name = "docx_saved"
                        event_payload = result
                    elif tool_name == "export_xlsx":
                        job = enqueue_xlsx_job(parsed_args)
                        result = {"job_id": job["id"]}
                        event_name = "xlsx_job"
                        event_payload = result
                    elif tool_name == "generate_image":
                        result = run_generate_image_tool(parsed_args)
                        event_name = "image_generated"
                        event_payload = result
                    elif tool_name == "resize_image":
                        result = run_resize_image_tool(parsed_args)
                        event_name = "image_updated"
                        event_payload = {"operation": "resize", "result": result}
                    elif tool_name == "crop_image":
                        result = run_crop_image_tool(parsed_args)
                        event_name = "image_updated"
                        event_payload = {"operation": "crop", "result": result}
                    elif tool_name == "convert_image":
                        result = run_convert_image_tool(parsed_args)
                        event_name = "image_updated"
                        event_payload = {"operation": "convert", "result": result}
                    elif tool_name == "load_skill":
                        skill_name = parsed_args.get("skill_name") or ""
                        content = get_skill_content(skill_name)
                        result = content if content else {"error": f"Skill not found: {skill_name!r}"}
                        event_name = "skill_loaded"
                        event_payload = {"skill_name": skill_name, "loaded": bool(content)}
                        tool_content = content if content else json.dumps(result)
                        yield sse_event(event_name, json.dumps(event_payload))
                        pending_messages.append(
                            {
                                "role": "assistant",
                                "content": assistant_text,
                                "tool_calls": [
                                    {
                                        "id": tool_id,
                                        "type": "function",
                                        "function": {
                                            "name": tool_name or "tool",
                                            "arguments": raw_args,
                                        },
                                    }
                                ],
                            }
                        )
                        pending_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_id,
                                "name": tool_name or "tool",
                                "content": tool_content,
                            }
                        )
                        continue
                    elif tool_name not in BUILTIN_TOOL_NAMES:
                        if call_mcp_tool is not None:
                            result = call_mcp_tool(tool_name, parsed_args)
                            event_name = "mcp_result"
                            event_payload = {"tool": tool_name, "ok": True}
                            tool_content = result if isinstance(result, str) else json.dumps(result)
                        else:
                            log_unexpected_path(
                                "Model requested an MCP tool but MCP support is not configured.",
                                tool_name=tool_name,
                            )
                            event_name = "mcp_result"
                            event_payload = {"tool": tool_name, "ok": False, "error": "MCP not configured."}
                            tool_content = json.dumps({"error": "MCP not configured or mcp package not installed."})
                        yield sse_event(event_name, json.dumps(event_payload))
                        pending_messages.append(
                            {
                                "role": "assistant",
                                "content": assistant_text,
                                "tool_calls": [
                                    {
                                        "id": tool_id,
                                        "type": "function",
                                        "function": {
                                            "name": tool_name or "tool",
                                            "arguments": raw_args,
                                        },
                                    }
                                ],
                            }
                        )
                        pending_messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tool_id,
                                "name": tool_name or "tool",
                                "content": tool_content,
                            }
                        )
                        continue
                    else:
                        log_unexpected_path(
                            "Tool dispatcher reached unsupported builtin tool branch.",
                            tool_name=tool_name,
                            builtin_tools=sorted(BUILTIN_TOOL_NAMES),
                        )
                        raise ValueError("Unsupported tool.")
                    yield sse_event(event_name, json.dumps(event_payload))
                    tool_content = json.dumps(result)
                except Exception as exc:
                    logger.exception("Tool execution failed.", extra={"tool_name": tool_name or "unknown"})
                    log_debug_error(
                        f"[tool_error] {tool_name or 'unknown'}",
                        "\n".join(
                            [
                                f"Args: {raw_args}",
                                f"Error: {exc}",
                                traceback.format_exc(),
                            ]
                        ),
                    )
                    error_payload = {"error": str(exc)}
                    event_name = allowed_tools.get(tool_name, "error")
                    if event_name == "image_updated":
                        error_payload = {"operation": tool_name.replace("_image", ""), "error": str(exc)}
                    yield sse_event(event_name, json.dumps(error_payload))
                    tool_content = json.dumps(error_payload)

                pending_messages.append(
                    {
                        "role": "assistant",
                        "content": assistant_text,
                        "tool_calls": [
                            {
                                "id": tool_id,
                                "type": "function",
                                "function": {
                                    "name": tool_name or "tool",
                                    "arguments": raw_args,
                                },
                            }
                        ],
                    }
                )
                pending_messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": tool_name or "tool",
                        "content": tool_content,
                    }
                )
            continue

        if sources_payload:
            yield sse_event("sources", json.dumps(sources_payload))
        yield sse_event("done", "")
    except Exception as exc:
        logger.exception("Unhandled exception in /chat/stream generator.")
        yield sse_event("error", str(exc))
        yield sse_event("done", "")
