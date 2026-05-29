from datetime import date

from services.core import usage
from core.code_settings import (
    GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD,
    OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD,
)


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def lte(self, *_args, **_kwargs):
        return self

    def execute(self):
        return _FakeResult(self._rows)


class _FakeSupabase:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeTable(self._rows)


def test_usage_summary_month_remaining_from_limits(monkeypatch):
    fixed_today = date(2026, 6, 15)
    monkeypatch.setattr(usage, "_today_utc", lambda: fixed_today)
    monkeypatch.setattr(
        usage,
        "get_supabase_client",
        lambda: _FakeSupabase(
            [
                {"date": "2026-06-01", "images_generated": 2},
                {"date": "2026-06-10", "images_generated": 3},
            ]
        ),
    )
    monkeypatch.setattr(
        usage,
        "get_provider_usage",
        lambda *_args, **_kwargs: {
            "providers": {
                "openai": {"total_tokens": 120},
                "gemini": {"total_tokens": 80},
            },
            "totals": {"total_tokens": 200, "requests_count": 4, "input_tokens": 50, "output_tokens": 150, "cost_usd": 1.25},
        },
    )
    monkeypatch.setenv(OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD["month"], "500")
    monkeypatch.setenv(GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD["month"], "300")

    result = usage.get_usage_summary("u-1", "month")

    assert result["images_generated"] == 5
    assert result["local_images_graph"]["available"] is True
    assert result["local_images_graph"]["mode"] == "month_daily"
    assert len(result["local_images_graph"]["series"]) == 15
    assert result["remaining"]["openai_tokens"] == 380
    assert result["remaining"]["gemini_tokens"] == 220


def test_usage_summary_year_uses_year_limits(monkeypatch):
    monkeypatch.setattr(
        usage,
        "get_supabase_client",
        lambda: _FakeSupabase([]),
    )
    monkeypatch.setattr(
        usage,
        "get_provider_usage",
        lambda *_args, **_kwargs: {
            "providers": {"openai": {"total_tokens": 5000}, "gemini": {"total_tokens": 2000}},
            "totals": {"total_tokens": 7000, "requests_count": 30, "input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0},
        },
    )
    monkeypatch.setenv(OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD["year"], "8000")
    monkeypatch.setenv(GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD["year"], "10000")

    result = usage.get_usage_summary("u-1", "year")

    assert result["remaining"]["openai_tokens"] == 3000
    assert result["remaining"]["gemini_tokens"] == 8000


def test_openai_usage_bucket_uses_results_key():
    """Live API uses `results`; older docs used `result`."""
    bucket_results = {
        "object": "bucket",
        "start_time": 0,
        "results": [{"input_tokens": 100, "output_tokens": 50, "object": "organization.usage.completions.result"}],
    }
    assert usage._extract_usage_tokens(bucket_results) == 150

    bucket_legacy = {
        "result": [{"input_tokens": 10, "output_tokens": 5, "object": "organization.usage.completions.result"}],
    }
    assert usage._extract_usage_tokens(bucket_legacy) == 15

    cost_bucket = {
        "results": [{"amount": {"currency": "usd", "value": 1.5}, "object": "organization.costs.result"}],
    }
    assert usage._extract_cost_usd(cost_bucket) == 1.5


def test_model_name_is_image_heuristic():
    assert usage._model_name_is_image("gpt-image-1") is True
    assert usage._model_name_is_image("dall-e-3") is True
    assert usage._model_name_is_image("gpt-4o") is False


def test_completion_row_output_tokens_only_for_completions():
    row_ok = {
        "object": "organization.usage.completions.result",
        "output_tokens": 42,
        "model": "gpt-image-1",
    }
    assert usage._completion_row_output_tokens(row_ok) == 42

    row_emb = {"object": "organization.usage.embeddings.result", "output_tokens": 99}
    assert usage._completion_row_output_tokens(row_emb) == 0


def test_local_images_graph_month_fills_missing_days(monkeypatch):
    monkeypatch.setattr(
        usage,
        "get_supabase_client",
        lambda: _FakeSupabase(
            [
                {"date": "2026-04-01", "images_generated": 2},
                {"date": "2026-04-03", "images_generated": 1},
            ]
        ),
    )
    result = usage._local_images_graph_data("u-1", "month", date(2026, 4, 4))
    assert result["available"] is True
    assert result["mode"] == "month_daily"
    assert len(result["series"]) == 4
    assert result["series"][0] == {"day": "2026-04-01", "count": 2}
    assert result["series"][1] == {"day": "2026-04-02", "count": 0}
    assert result["series"][2] == {"day": "2026-04-03", "count": 1}
    assert result["series"][3] == {"day": "2026-04-04", "count": 0}


def test_local_images_graph_year_buckets_by_month(monkeypatch):
    monkeypatch.setattr(
        usage,
        "get_supabase_client",
        lambda: _FakeSupabase(
            [
                {"date": "2026-02-10", "images_generated": 3},
                {"date": "2026-02-20", "images_generated": 2},
                {"date": "2026-04-01", "images_generated": 7},
            ]
        ),
    )
    result = usage._local_images_graph_data("u-1", "year", date(2026, 4, 5))
    assert result["available"] is True
    assert result["mode"] == "year_monthly"
    assert len(result["series"]) == 12
    feb = next(x for x in result["series"] if x["month"] == "2026-02")
    assert feb["count"] == 5
    apr = next(x for x in result["series"] if x["month"] == "2026-04")
    assert apr["count"] == 7
    jan = next(x for x in result["series"] if x["month"] == "2026-01")
    assert jan["count"] == 0
