import io
import struct
import wave

import pytest

from services.audio.audiobank_convert import (
    convert_audio_bytes,
    replace_filename_extension,
)


def _make_silent_wav(*, duration_ms: int = 50, sample_rate: int = 44100, sample_width: int = 2) -> bytes:
    frame_count = int(sample_rate * duration_ms / 1000)
    if sample_width == 2:
        frames = b"\x00\x00" * frame_count
    elif sample_width == 3:
        frames = b"\x00\x00\x00" * frame_count
    elif sample_width == 4:
        frames = struct.pack("<i", 0) * frame_count
    else:
        raise ValueError(f"Unsupported sample width for test helper: {sample_width}")

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(sample_width)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(frames)
    return buf.getvalue()


def test_replace_filename_extension():
    assert replace_filename_extension("button_click_01.wav", "mp3") == "button_click_01.mp3"
    assert replace_filename_extension("button_click_01.mp3", "wav") == "button_click_01.wav"


def test_convert_audio_bytes_passthrough_wav():
    data = b"RIFFxxxx"
    out, content_type, name = convert_audio_bytes(
        data,
        filename="clip.wav",
        content_type="audio/wav",
        target_format="wav",
    )
    assert out == data
    assert content_type == "audio/wav"
    assert name == "clip.wav"


def test_convert_audio_bytes_wav_to_mp3():
    wav_data = _make_silent_wav()
    out, content_type, name = convert_audio_bytes(
        wav_data,
        filename="clip.wav",
        content_type="audio/wav",
        target_format="mp3",
    )
    assert out.startswith(b"ID3") or out[:2] == b"\xff\xfb"
    assert content_type == "audio/mpeg"
    assert name == "clip.mp3"


def test_convert_audio_bytes_24bit_wav_to_mp3():
    wav_data = _make_silent_wav(sample_width=3)
    out, content_type, name = convert_audio_bytes(
        wav_data,
        filename="clip.wav",
        content_type="audio/wav",
        target_format="mp3",
    )
    assert out.startswith(b"ID3") or out[:2] == b"\xff\xfb"
    assert content_type == "audio/mpeg"
    assert name == "clip.mp3"


def test_convert_audio_bytes_mp3_to_wav_round_trip():
    wav_data = _make_silent_wav()
    mp3_data, _, _ = convert_audio_bytes(
        wav_data,
        filename="clip.wav",
        content_type="audio/wav",
        target_format="mp3",
    )
    out, content_type, name = convert_audio_bytes(
        mp3_data,
        filename="clip.mp3",
        content_type="audio/mpeg",
        target_format="wav",
    )
    assert out.startswith(b"RIFF")
    assert content_type == "audio/wav"
    assert name == "clip.wav"


def test_convert_audio_bytes_invalid_wav_raises():
    with pytest.raises(RuntimeError, match="Audio conversion failed"):
        convert_audio_bytes(
            b"RIFFxxxx",
            filename="clip.wav",
            content_type="audio/wav",
            target_format="mp3",
        )
