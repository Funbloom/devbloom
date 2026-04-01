from __future__ import annotations

from typing import Any, Iterable

from local_agent.models import JsonPatchOp


def apply_json_patch(doc: Any, patch: Iterable[JsonPatchOp]) -> Any:
    data = doc
    for op in patch:
        if op.op not in {"add", "replace", "remove"}:
            raise ValueError(f"Unsupported op: {op.op}")
        tokens = _parse_pointer(op.path)
        if op.op == "remove":
            _remove_at(data, tokens)
        elif op.op == "add":
            _add_at(data, tokens, op.value)
        elif op.op == "replace":
            _replace_at(data, tokens, op.value)
    return data


def _parse_pointer(path: str) -> list[str]:
    if not path.startswith("/"):
        raise ValueError("Patch path must start with '/'.")
    tokens = path.lstrip("/").split("/")
    return [t.replace("~1", "/").replace("~0", "~") for t in tokens if t]


def _navigate(parent: Any, tokens: list[str]) -> tuple[Any, str]:
    if not tokens:
        raise ValueError("Path cannot be empty.")
    key = tokens[-1]
    target = parent
    for token in tokens[:-1]:
        if isinstance(target, list):
            idx = _index(token, len(target))
            target = target[idx]
        elif isinstance(target, dict):
            if token not in target:
                raise ValueError(f"Path not found: {token}")
            target = target[token]
        else:
            raise ValueError("Invalid path target.")
    return target, key


def _index(token: str, length: int) -> int:
    try:
        idx = int(token)
    except ValueError as exc:
        raise ValueError("List index must be an integer.") from exc
    if idx < 0 or idx >= length:
        raise ValueError("List index out of range.")
    return idx


def _add_at(doc: Any, tokens: list[str], value: Any) -> None:
    parent, key = _navigate(doc, tokens)
    if isinstance(parent, list):
        if key == "-":
            parent.append(value)
        else:
            idx = _index(key, len(parent) + 1)
            parent.insert(idx, value)
        return
    if isinstance(parent, dict):
        parent[key] = value
        return
    raise ValueError("Invalid add target.")


def _replace_at(doc: Any, tokens: list[str], value: Any) -> None:
    parent, key = _navigate(doc, tokens)
    if isinstance(parent, list):
        idx = _index(key, len(parent))
        parent[idx] = value
        return
    if isinstance(parent, dict):
        if key not in parent:
            raise ValueError("Path not found for replace.")
        parent[key] = value
        return
    raise ValueError("Invalid replace target.")


def _remove_at(doc: Any, tokens: list[str]) -> None:
    parent, key = _navigate(doc, tokens)
    if isinstance(parent, list):
        idx = _index(key, len(parent))
        parent.pop(idx)
        return
    if isinstance(parent, dict):
        if key not in parent:
            raise ValueError("Path not found for remove.")
        parent.pop(key, None)
        return
    raise ValueError("Invalid remove target.")
