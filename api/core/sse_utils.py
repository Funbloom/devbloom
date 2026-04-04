"""Server-Sent Events framing for chat stream."""


def sse_event(event: str, data: str) -> bytes:
    lines = data.split("\n")
    payload = "".join([f"event: {event}\n"] + [f"data: {line}\n" for line in lines] + ["\n"])
    return payload.encode("utf-8")
