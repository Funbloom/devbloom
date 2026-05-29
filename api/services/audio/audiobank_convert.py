from __future__ import annotations

import io
import struct
import wave
from typing import Tuple

import mp3

_MP3_BITRATE_KBPS = 192
_PCM_CHUNK_FRAMES = 8000


def _content_type_for_format(fmt: str) -> str:
    if fmt == "mp3":
        return "audio/mpeg"
    return "audio/wav"


def _detect_source_format(filename: str, content_type: str) -> str:
    lower_name = (filename or "").lower()
    if lower_name.endswith(".mp3") or "mpeg" in (content_type or "").lower():
        return "mp3"
    return "wav"


def replace_filename_extension(filename: str, fmt: str) -> str:
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    return f"{stem}.{fmt}"


def _float_sample_to_s16(sample: float) -> int:
    clamped = max(-1.0, min(1.0, sample))
    if clamped < 0.0:
        return int(round(clamped * 32768.0))
    return int(round(clamped * 32767.0))


def _wav_frames_to_pcm_s16(raw: bytes, *, sample_width: int, is_ieee_float: bool) -> bytes:
    if sample_width == 2 and not is_ieee_float:
        return raw

    out = bytearray()
    if is_ieee_float:
        if sample_width != 4:
            raise ValueError(f"IEEE float WAV must be 32-bit (got {sample_width * 8}-bit).")
        for offset in range(0, len(raw), 4):
            sample = struct.unpack_from("<f", raw, offset)[0]
            out.extend(struct.pack("<h", _float_sample_to_s16(sample)))
        return bytes(out)

    if sample_width == 1:
        for sample_byte in raw:
            out.extend(struct.pack("<h", (sample_byte - 128) * 256))
        return bytes(out)

    if sample_width == 3:
        for offset in range(0, len(raw), 3):
            sample = raw[offset] | (raw[offset + 1] << 8) | (raw[offset + 2] << 16)
            if sample & 0x800000:
                sample -= 0x1000000
            out.extend(struct.pack("<h", sample >> 8))
        return bytes(out)

    if sample_width == 4:
        for offset in range(0, len(raw), 4):
            sample = struct.unpack_from("<i", raw, offset)[0]
            out.extend(struct.pack("<h", sample >> 16))
        return bytes(out)

    raise ValueError(f"Unsupported WAV sample width: {sample_width * 8}-bit.")


def _read_wav_pcm_s16(data: bytes) -> Tuple[bytes, int, int]:
    read_io = io.BytesIO(data)
    wav_file = wave.Wave_read(read_io)
    params = wav_file.getparams()
    if params.comptype not in {"", "NONE"} and params.compname not in {"", "not compressed", "IEEE Float"}:
        raise ValueError(f"Unsupported WAV compression: {params.comptype}/{params.compname}.")

    is_ieee_float = params.compname == "IEEE Float"
    frame_rate = wav_file.getframerate()
    nchannels = wav_file.getnchannels()
    sample_width = wav_file.getsampwidth()
    pcm_chunks: list[bytes] = []

    while True:
        raw_frames = wav_file.readframes(_PCM_CHUNK_FRAMES)
        if not raw_frames:
            break
        pcm_chunks.append(
            _wav_frames_to_pcm_s16(
                raw_frames,
                sample_width=sample_width,
                is_ieee_float=is_ieee_float,
            )
        )

    return b"".join(pcm_chunks), frame_rate, nchannels


def _encode_pcm_s16_to_mp3(pcm_s16: bytes, *, frame_rate: int, nchannels: int) -> bytes:
    out_io = io.BytesIO()
    encoder = mp3.Encoder(out_io)
    encoder.set_bit_rate(_MP3_BITRATE_KBPS)
    encoder.set_sample_rate(frame_rate)
    encoder.set_channels(nchannels)
    encoder.set_quality(2)
    encoder.set_mode(mp3.MODE_STEREO if nchannels == 2 else mp3.MODE_SINGLE_CHANNEL)

    frame_bytes = nchannels * 2
    chunk_bytes = frame_bytes * _PCM_CHUNK_FRAMES
    for offset in range(0, len(pcm_s16), chunk_bytes):
        chunk = pcm_s16[offset : offset + chunk_bytes]
        if chunk:
            encoder.write(chunk)

    encoder.flush()
    return out_io.getvalue()


def _wav_to_mp3(data: bytes) -> bytes:
    pcm_s16, frame_rate, nchannels = _read_wav_pcm_s16(data)
    return _encode_pcm_s16_to_mp3(pcm_s16, frame_rate=frame_rate, nchannels=nchannels)


def _mp3_to_wav(data: bytes) -> bytes:
    read_io = io.BytesIO(data)
    out_io = io.BytesIO()
    decoder = mp3.Decoder(read_io)
    wav_file = wave.Wave_write(out_io)
    wav_file.setnchannels(decoder.get_channels())
    wav_file.setsampwidth(2)
    wav_file.setframerate(decoder.get_sample_rate())

    while True:
        pcm_data = decoder.read(4000)
        if not pcm_data:
            break
        wav_file.writeframes(pcm_data)

    return out_io.getvalue()


def convert_audio_bytes(
    data: bytes,
    *,
    filename: str,
    content_type: str,
    target_format: str,
) -> Tuple[bytes, str, str]:
    fmt = (target_format or "").lower().lstrip(".")
    if fmt not in {"wav", "mp3"}:
        raise ValueError("Supported export formats are wav and mp3.")

    source_format = _detect_source_format(filename, content_type)
    out_name = replace_filename_extension(filename, fmt)
    if source_format == fmt:
        return data, _content_type_for_format(fmt), out_name

    try:
        if source_format == "wav" and fmt == "mp3":
            converted = _wav_to_mp3(data)
        elif source_format == "mp3" and fmt == "wav":
            converted = _mp3_to_wav(data)
        else:
            raise ValueError(f"Unsupported conversion from {source_format} to {fmt}.")
    except Exception as exc:
        raise RuntimeError(f"Audio conversion failed: {exc}") from exc

    if not converted:
        raise RuntimeError(f"Audio conversion failed: empty {fmt.upper()} output.")

    return converted, _content_type_for_format(fmt), out_name
