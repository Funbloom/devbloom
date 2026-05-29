"""User usage tracking: image counts + provider usage aggregates."""
import logging
import os
from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import HTTPException
import requests

from core.code_settings import (
    GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD,
    OPENAI_TOKEN_BUDGET_DEFAULT_BY_PERIOD,
    OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD,
)
from services.core.rag import get_supabase_client

MAX_IMAGES_PER_USER_PER_DAY = int(os.getenv("MAX_IMAGES_PER_USER_PER_DAY", "80"))
logger = logging.getLogger(__name__)
OPENAI_API_BASE = "https://api.openai.com/v1"


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def get_usage_today(user_id: str) -> int:
    """Return number of images generated today for this user."""
    if not (user_id or "").strip():
        return 0
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        r = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .eq("date", today)
            .limit(1)
            .execute()
        )
        if not r.data or len(r.data) == 0:
            return 0
        return int(r.data[0].get("images_generated", 0) or 0)
    except Exception:
        logger.exception("Failed to load today's image usage.", extra={"user_id": user_id})
        return 0


def get_usage_total(user_id: str) -> int:
    """Return total number of images generated (all time) for this user."""
    if not (user_id or "").strip():
        return 0
    try:
        supabase = get_supabase_client()
        r = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .execute()
        )
        if not r.data:
            return 0
        return sum(int(row.get("images_generated", 0) or 0) for row in r.data)
    except Exception:
        logger.exception("Failed to load total image usage.", extra={"user_id": user_id})
        return 0


def get_usage_for_users(user_ids: list[str]) -> dict[str, dict]:
    """Return { user_id: { "images_today": int, "images_total": int } } for the given user ids."""
    result: dict[str, dict] = {uid: {"images_today": 0, "images_total": 0} for uid in user_ids if uid}
    if not result:
        return result
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        r = (
            supabase.table("user_usage_daily")
            .select("user_id, date, images_generated")
            .in_("user_id", list(result.keys()))
            .execute()
        )
        if not r.data:
            return result
        for row in r.data:
            uid = row.get("user_id")
            if uid not in result:
                continue
            count = int(row.get("images_generated", 0) or 0)
            result[uid]["images_total"] = result[uid]["images_total"] + count
            if row.get("date") == today:
                result[uid]["images_today"] = count
        return result
    except Exception:
        logger.exception("Failed to load image usage for users.", extra={"user_ids": user_ids})
        return result


def increment_usage(user_id: str, count: int = 1) -> None:
    """Increment today's image count for this user by count (upsert)."""
    if not (user_id or "").strip() or count <= 0:
        return
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        # Upsert: add count to existing row or set count for new row
        existing = (
            supabase.table("user_usage_daily")
            .select("images_generated")
            .eq("user_id", user_id)
            .eq("date", today)
            .limit(1)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            current = int(existing.data[0].get("images_generated", 0) or 0)
            supabase.table("user_usage_daily").update(
                {"images_generated": current + count}
            ).eq("user_id", user_id).eq("date", today).execute()
        else:
            supabase.table("user_usage_daily").insert({
                "user_id": user_id,
                "date": today,
                "images_generated": count,
            }).execute()
    except Exception:
        logger.exception("Failed to increment image usage.", extra={"user_id": user_id, "count": count})


def check_can_generate_images(user_id: str, is_admin: bool, count: int = 1) -> None:
    """Raise HTTPException 403 if user would exceed daily limit. Admins are unlimited."""
    if is_admin:
        return
    today_count = get_usage_today(user_id)
    if today_count + count > MAX_IMAGES_PER_USER_PER_DAY:
        raise HTTPException(
            status_code=403,
            detail=f"Daily image limit reached ({MAX_IMAGES_PER_USER_PER_DAY} per day). You have used {today_count} today. Resets at midnight UTC.",
        )


def _parse_period(period: str) -> Literal["month", "year"]:
    p = (period or "").strip().lower()
    if p not in ("month", "year"):
        raise ValueError("period must be 'month' or 'year'")
    return p  # type: ignore[return-value]


def _period_start(today: date, period: Literal["month", "year"]) -> date:
    if period == "year":
        return date(today.year, 1, 1)
    return date(today.year, today.month, 1)


def _read_user_usage_daily_range(
    user_id: str, start: date, end: date
) -> list[dict[str, Any]] | None:
    """Return rows with date + images_generated, or None if the query failed."""
    uid = (user_id or "").strip()
    if not uid:
        return []
    try:
        supabase = get_supabase_client()
        response = (
            supabase.table("user_usage_daily")
            .select("date, images_generated")
            .eq("user_id", uid)
            .gte("date", start.isoformat())
            .lte("date", end.isoformat())
            .execute()
        )
        return [r for r in (response.data or []) if isinstance(r, dict)]
    except Exception:
        logger.exception(
            "Failed to read user_usage_daily for range.",
            extra={"user_id": uid, "start": start.isoformat(), "end": end.isoformat()},
        )
        return None


def _usage_daily_rows_to_by_date(rows: list[dict[str, Any]]) -> dict[str, int]:
    by_date: dict[str, int] = {}
    for r in rows:
        d_raw = r.get("date")
        d = str(d_raw)[:10] if d_raw is not None else ""
        if not d:
            continue
        by_date[d] = by_date.get(d, 0) + int(r.get("images_generated", 0) or 0)
    return by_date


def _build_local_images_graph(
    by_date: dict[str, int],
    period: Literal["month", "year"],
    today: date,
    start: date,
) -> dict[str, Any]:
    end = today
    if period == "month":
        series: list[dict[str, Any]] = []
        d = start
        while d <= end:
            key = d.isoformat()
            series.append({"day": key, "count": int(by_date.get(key, 0))})
            d = d + timedelta(days=1)
        return {"available": True, "mode": "month_daily", "series": series}

    monthly: dict[str, int] = {f"{today.year:04d}-{m:02d}": 0 for m in range(1, 13)}
    for key, c in by_date.items():
        if len(key) >= 7:
            mk = key[:7]
            if mk in monthly:
                monthly[mk] = int(monthly[mk]) + int(c)
    monthly_series = [{"month": mk, "count": int(monthly[mk])} for mk in sorted(monthly.keys())]
    return {"available": True, "mode": "year_monthly", "series": monthly_series}


def _local_images_graph_data(
    user_id: str, period: Literal["month", "year"], today: date
) -> dict[str, Any]:
    """Daily or monthly image counts from user_usage_daily for the Local metrics chart."""
    uid = (user_id or "").strip()
    if not uid:
        return {"available": False, "reason": "no_user"}
    start = _period_start(today, period)
    rows = _read_user_usage_daily_range(uid, start, today)
    if rows is None:
        return {"available": False, "reason": "query_failed"}
    by_date = _usage_daily_rows_to_by_date(rows)
    return _build_local_images_graph(by_date, period, today, start)


def _to_unix_utc(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def _month_range_utc(today: date) -> tuple[int, int]:
    start = date(today.year, today.month, 1)
    if today.month == 12:
        next_month = date(today.year + 1, 1, 1)
    else:
        next_month = date(today.year, today.month + 1, 1)
    return _to_unix_utc(start), _to_unix_utc(next_month)


def _year_range_utc(today: date) -> tuple[int, int]:
    start = date(today.year, 1, 1)
    next_year = date(today.year + 1, 1, 1)
    return _to_unix_utc(start), _to_unix_utc(next_year)


def _openai_headers() -> dict[str, str] | None:
    key = (os.getenv("OPENAI_ADMIN_KEY") or os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    headers = {"Authorization": f"Bearer {key}"}
    org = (os.getenv("OPENAI_ORGANIZATION") or "").strip()
    if org:
        if org.startswith("org-") or org.startswith("org_"):
            headers["OpenAI-Organization"] = org
        else:
            logger.warning(
                "Ignoring OPENAI_ORGANIZATION because it is not an org id (expected prefix 'org-' or 'org_')."
            )
    project = (os.getenv("OPENAI_PROJECT") or "").strip()
    if project:
        if project.startswith("proj-") or project.startswith("proj_"):
            headers["OpenAI-Project"] = project
        else:
            logger.warning(
                "Ignoring OPENAI_PROJECT because it is not a project id (expected prefix 'proj-' or 'proj_')."
            )
    return headers


def _fetch_openai_json(path: str, params: dict[str, Any]) -> dict[str, Any]:
    headers = _openai_headers()
    if not headers:
        return {}
    try:
        response = requests.get(f"{OPENAI_API_BASE}{path}", headers=headers, params=params, timeout=25)
        if not response.ok:
            body_preview = (response.text or "").replace("\n", " ").strip()[:400]
            logger.warning(
                "OpenAI usage/cost request failed: %s HTTP %s body=%s",
                path,
                response.status_code,
                body_preview or "(empty)",
            )
            return {}
        payload = response.json()
        return payload if isinstance(payload, dict) else {}
    except Exception:
        logger.exception("OpenAI usage/cost request failed unexpectedly.", extra={"path": path})
        return {}


def _fetch_openai_buckets(path: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    """Fetch paginated OpenAI bucket responses and combine all data rows."""
    merged: list[dict[str, Any]] = []
    page: str | None = None
    for _ in range(24):  # safety cap
        effective_params = dict(params)
        if page:
            effective_params["page"] = page
        payload = _fetch_openai_json(path, effective_params)
        if not isinstance(payload, dict):
            break
        data = payload.get("data")
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    merged.append(item)
        next_page = payload.get("next_page")
        if not isinstance(next_page, str) or not next_page.strip():
            break
        page = next_page.strip()
    return merged


def _bucket_rows(bucket: dict[str, Any]) -> list[dict[str, Any]]:
    """OpenAI returns either `results` (current) or `result` (legacy) per bucket."""
    raw = bucket.get("results")
    if raw is None:
        raw = bucket.get("result")
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if isinstance(raw, dict):
        return [raw]
    return []


def _extract_usage_tokens(bucket: dict[str, Any]) -> int:
    total = 0
    for row in _bucket_rows(bucket):
        input_tokens = int(row.get("input_tokens", 0) or 0)
        output_tokens = int(row.get("output_tokens", 0) or 0)
        total += max(0, input_tokens) + max(0, output_tokens)
    return total


def _extract_cost_usd(bucket: dict[str, Any]) -> float:
    total = 0.0
    for row in _bucket_rows(bucket):
        amount = row.get("amount")
        if isinstance(amount, dict):
            total += float(amount.get("value", 0.0) or 0.0)
    return total


def _extract_image_operations(bucket: dict[str, Any]) -> int:
    """Count image API operations from /organization/usage/images buckets (no token field in API)."""
    total = 0
    for row in _bucket_rows(bucket):
        obj = str(row.get("object") or "")
        if "images.result" in obj or "images" in row:
            total += int(row.get("images", 0) or 0)
    return total


def _bucket_day_iso(bucket: dict[str, Any]) -> str:
    st = int(bucket.get("start_time", 0) or 0)
    return datetime.fromtimestamp(st, tz=timezone.utc).strftime("%Y-%m-%d")


def _line_item_is_image_cost(line_item: str) -> bool:
    li = (line_item or "").strip().lower()
    if not li:
        return False
    needles = ("image", "gpt-image", "dall", "dalle")
    return any(n in li for n in needles)


def _model_name_is_image(model: str) -> bool:
    """Heuristic: completion-usage rows for image generation models (group_by=model)."""
    m = (model or "").strip().lower()
    if not m:
        return False
    needles = ("gpt-image", "gpt_image", "dall-e", "dalle")
    return any(n in m for n in needles)


def _completion_row_output_tokens(row: dict[str, Any]) -> int:
    obj = str(row.get("object") or "")
    if obj and "completions.result" not in obj:
        return 0
    return max(0, int(row.get("output_tokens", 0) or 0))


def _split_cost_by_day_image_vs_chat(buckets: list[dict[str, Any]]) -> tuple[dict[str, float], dict[str, float]]:
    image_cost: dict[str, float] = {}
    chat_cost: dict[str, float] = {}
    for bucket in buckets:
        if not isinstance(bucket, dict):
            continue
        day = _bucket_day_iso(bucket)
        for row in _bucket_rows(bucket):
            li = row.get("line_item")
            li_s = str(li) if li is not None else ""
            amount = row.get("amount")
            val = float(amount.get("value", 0.0) or 0.0) if isinstance(amount, dict) else 0.0
            if _line_item_is_image_cost(li_s):
                image_cost[day] = image_cost.get(day, 0.0) + val
            else:
                chat_cost[day] = chat_cost.get(day, 0.0) + val
    return image_cost, chat_cost


def _month_key_from_unix(ts: int) -> str:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    return f"{dt.year:04d}-{dt.month:02d}"


def _openai_graph_data(period: Literal["month", "year"], today: date) -> dict[str, Any]:
    headers = _openai_headers()
    if not headers:
        return {"available": False, "reason": "missing_openai_key"}

    if period == "year":
        start_time, end_time = _year_range_utc(today)
    else:
        start_time, end_time = _month_range_utc(today)
    per_page_limit = 31
    usage_buckets = _fetch_openai_buckets(
        "/organization/usage/completions",
        {
            "start_time": start_time,
            "end_time": end_time,
            "bucket_width": "1d",
            "limit": per_page_limit,
        },
    )
    cost_buckets = _fetch_openai_buckets(
        "/organization/costs",
        {
            "start_time": start_time,
            "end_time": end_time,
            "bucket_width": "1d",
            "limit": per_page_limit,
        },
    )

    if period == "year":
        monthly: dict[str, dict[str, Any]] = {}
        for month in range(1, 13):
            mk = f"{today.year:04d}-{month:02d}"
            monthly[mk] = {"month": mk, "tokens": 0, "cost_usd": 0.0}
        for bucket in usage_buckets:
            if not isinstance(bucket, dict):
                continue
            st = int(bucket.get("start_time", 0) or 0)
            mk = _month_key_from_unix(st)
            if mk in monthly:
                monthly[mk]["tokens"] = int(monthly[mk]["tokens"]) + _extract_usage_tokens(bucket)
        for bucket in cost_buckets:
            if not isinstance(bucket, dict):
                continue
            st = int(bucket.get("start_time", 0) or 0)
            mk = _month_key_from_unix(st)
            if mk in monthly:
                monthly[mk]["cost_usd"] = float(monthly[mk]["cost_usd"]) + _extract_cost_usd(bucket)
        return {
            "available": True,
            "mode": "year_monthly",
            "series": [monthly[k] for k in sorted(monthly.keys())],
        }

    image_usage_buckets = _fetch_openai_buckets(
        "/organization/usage/images",
        {
            "start_time": start_time,
            "end_time": end_time,
            "bucket_width": "1d",
            "limit": per_page_limit,
        },
    )
    completions_by_model_buckets = _fetch_openai_buckets(
        "/organization/usage/completions",
        {
            "start_time": start_time,
            "end_time": end_time,
            "bucket_width": "1d",
            "limit": per_page_limit,
            "group_by": ["model"],
        },
    )
    cost_buckets_line_item = _fetch_openai_buckets(
        "/organization/costs",
        {
            "start_time": start_time,
            "end_time": end_time,
            "bucket_width": "1d",
            "limit": per_page_limit,
            "group_by": ["line_item"],
        },
    )

    chat_tokens_by_day: dict[str, int] = {}
    for bucket in usage_buckets:
        if not isinstance(bucket, dict):
            continue
        day = _bucket_day_iso(bucket)
        chat_tokens_by_day[day] = chat_tokens_by_day.get(day, 0) + _extract_usage_tokens(bucket)

    images_by_day: dict[str, int] = {}
    for bucket in image_usage_buckets:
        if not isinstance(bucket, dict):
            continue
        day = _bucket_day_iso(bucket)
        images_by_day[day] = images_by_day.get(day, 0) + _extract_image_operations(bucket)

    image_output_tokens_by_day: dict[str, int] = {}
    for bucket in completions_by_model_buckets:
        if not isinstance(bucket, dict):
            continue
        day = _bucket_day_iso(bucket)
        for row in _bucket_rows(bucket):
            if not _model_name_is_image(str(row.get("model") or "")):
                continue
            image_output_tokens_by_day[day] = image_output_tokens_by_day.get(day, 0) + _completion_row_output_tokens(row)

    cost_total_by_day: dict[str, float] = {}
    for bucket in cost_buckets:
        if not isinstance(bucket, dict):
            continue
        day = _bucket_day_iso(bucket)
        cost_total_by_day[day] = cost_total_by_day.get(day, 0.0) + _extract_cost_usd(bucket)

    cost_image_by_day, cost_chat_by_day = _split_cost_by_day_image_vs_chat(cost_buckets_line_item)

    all_days = sorted(
        set(chat_tokens_by_day.keys())
        | set(images_by_day.keys())
        | set(cost_total_by_day.keys())
        | set(cost_image_by_day.keys())
        | set(cost_chat_by_day.keys())
        | set(image_output_tokens_by_day.keys()),
        key=lambda d: d,
    )

    series_total: list[dict[str, Any]] = []
    series_chat: list[dict[str, Any]] = []
    series_image: list[dict[str, Any]] = []
    tokens_total = 0
    cost_total = 0.0

    for day in all_days:
        tt = int(chat_tokens_by_day.get(day, 0) or 0)
        ic = int(images_by_day.get(day, 0) or 0)
        iout = int(image_output_tokens_by_day.get(day, 0) or 0)
        ct = float(cost_total_by_day.get(day, 0.0) or 0.0)
        cimg = float(cost_image_by_day.get(day, 0.0) or 0.0)
        cchat_split = float(cost_chat_by_day.get(day, 0.0) or 0.0)

        if cimg + cchat_split > 1e-9:
            cchat = cchat_split
        elif ct > 1e-9:
            cchat = max(0.0, ct - cimg)
            if cimg < 1e-9:
                cchat = ct
        else:
            cchat = 0.0

        tokens_total += tt
        cost_total += ct
        series_total.append({"day": day, "tokens": tt, "cost_usd": ct, "image_count": ic})
        series_chat.append({"day": day, "tokens": tt, "cost_usd": cchat, "image_count": 0})
        series_image.append({"day": day, "tokens": iout, "cost_usd": cimg, "image_count": ic})

    return {
        "available": True,
        "mode": "month_daily",
        "totals": {"tokens": tokens_total, "cost_usd": cost_total},
        "series": series_total,
        "series_by_breakdown": {
            "total": series_total,
            "chat": series_chat,
            "image": series_image,
        },
    }


def record_provider_usage(
    user_id: str,
    provider: str,
    *,
    service: str = "image_generation",
    requests_count: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    cost_usd: float = 0.0,
) -> None:
    """Upsert today's provider usage row and increment counters."""
    uid = (user_id or "").strip()
    pv = (provider or "").strip().lower()
    svc = (service or "").strip().lower() or "image_generation"
    if not uid or not pv:
        return
    if requests_count <= 0 and input_tokens <= 0 and output_tokens <= 0 and total_tokens <= 0 and cost_usd <= 0:
        return
    if total_tokens <= 0:
        total_tokens = max(0, int(input_tokens)) + max(0, int(output_tokens))
    try:
        supabase = get_supabase_client()
        today = _today_utc().isoformat()
        existing = (
            supabase.table("provider_usage_daily")
            .select("requests_count,input_tokens,output_tokens,total_tokens,cost_usd")
            .eq("user_id", uid)
            .eq("date", today)
            .eq("provider", pv)
            .eq("service", svc)
            .limit(1)
            .execute()
        )
        if existing.data and len(existing.data) > 0:
            row = existing.data[0]
            payload = {
                "requests_count": int(row.get("requests_count", 0) or 0) + max(0, int(requests_count)),
                "input_tokens": int(row.get("input_tokens", 0) or 0) + max(0, int(input_tokens)),
                "output_tokens": int(row.get("output_tokens", 0) or 0) + max(0, int(output_tokens)),
                "total_tokens": int(row.get("total_tokens", 0) or 0) + max(0, int(total_tokens)),
                "cost_usd": float(row.get("cost_usd", 0.0) or 0.0) + max(0.0, float(cost_usd or 0.0)),
            }
            (
                supabase.table("provider_usage_daily")
                .update(payload)
                .eq("user_id", uid)
                .eq("date", today)
                .eq("provider", pv)
                .eq("service", svc)
                .execute()
            )
        else:
            supabase.table("provider_usage_daily").insert(
                {
                    "user_id": uid,
                    "date": today,
                    "provider": pv,
                    "service": svc,
                    "requests_count": max(0, int(requests_count)),
                    "input_tokens": max(0, int(input_tokens)),
                    "output_tokens": max(0, int(output_tokens)),
                    "total_tokens": max(0, int(total_tokens)),
                    "cost_usd": max(0.0, float(cost_usd or 0.0)),
                }
            ).execute()
    except Exception:
        logger.exception("Failed to record provider usage.", extra={"user_id": uid, "provider": pv, "service": svc})


def get_provider_usage(user_id: str, period: str = "month") -> dict[str, Any]:
    """Aggregate provider usage for the given period."""
    uid = (user_id or "").strip()
    if not uid:
        return {"period": period, "providers": {}, "totals": {}}
    p = _parse_period(period)
    today = _today_utc()
    start = _period_start(today, p).isoformat()
    end = today.isoformat()
    providers: dict[str, dict[str, Any]] = {}
    totals = {
        "requests_count": 0,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "cost_usd": 0.0,
    }
    try:
        supabase = get_supabase_client()
        rows = (
            supabase.table("provider_usage_daily")
            .select("provider,service,requests_count,input_tokens,output_tokens,total_tokens,cost_usd")
            .eq("user_id", uid)
            .gte("date", start)
            .lte("date", end)
            .execute()
        )
        for row in rows.data or []:
            provider = str(row.get("provider") or "").strip().lower()
            if not provider:
                continue
            rec = providers.setdefault(
                provider,
                {
                    "provider": provider,
                    "requests_count": 0,
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "total_tokens": 0,
                    "cost_usd": 0.0,
                },
            )
            for key in ("requests_count", "input_tokens", "output_tokens", "total_tokens"):
                v = int(row.get(key, 0) or 0)
                rec[key] = int(rec[key]) + v
                totals[key] = int(totals[key]) + v
            c = float(row.get("cost_usd", 0.0) or 0.0)
            rec["cost_usd"] = float(rec["cost_usd"]) + c
            totals["cost_usd"] = float(totals["cost_usd"]) + c
    except Exception:
        logger.exception("Failed to read provider usage.", extra={"user_id": uid, "period": p})
    return {"period": p, "start_date": start, "end_date": end, "providers": providers, "totals": totals}


def get_usage_summary(user_id: str, period: str = "month") -> dict[str, Any]:
    """Combined usage summary for image counts + provider usage for period."""
    uid = (user_id or "").strip()
    p = _parse_period(period)
    today = _today_utc()
    start_d = _period_start(today, p)
    start = start_d.isoformat()
    end = today.isoformat()
    images_generated = 0
    local_images_graph: dict[str, Any]
    if not uid:
        local_images_graph = {"available": False, "reason": "no_user"}
    else:
        daily_rows = _read_user_usage_daily_range(uid, start_d, today)
        if daily_rows is None:
            images_generated = 0
            local_images_graph = {"available": False, "reason": "query_failed"}
        else:
            by_date = _usage_daily_rows_to_by_date(daily_rows)
            images_generated = sum(by_date.values())
            local_images_graph = _build_local_images_graph(by_date, p, today, start_d)
    provider_usage = get_provider_usage(uid, p)
    providers = provider_usage.get("providers", {})
    totals = provider_usage.get("totals", {})

    def _int_env(name: str) -> int | None:
        raw = (os.getenv(name) or "").strip()
        if not raw:
            return None
        try:
            return max(0, int(raw))
        except Exception:
            return None

    openai_budget = _int_env(OPENAI_TOKEN_BUDGET_ENV_BY_PERIOD[p])
    if openai_budget is None:
        openai_budget = OPENAI_TOKEN_BUDGET_DEFAULT_BY_PERIOD.get(p)
    gemini_quota = _int_env(GEMINI_TOKEN_QUOTA_ENV_BY_PERIOD[p])
    openai_used = int((providers.get("openai") or {}).get("total_tokens", 0) or 0)
    gemini_used = int((providers.get("gemini") or {}).get("total_tokens", 0) or 0)
    openai_graph = _openai_graph_data(p, today)
    if openai_graph.get("available") and openai_graph.get("mode") == "month_daily":
        external_totals = openai_graph.get("totals") or {}
        openai_used = int(external_totals.get("tokens", openai_used) or openai_used)
        providers["openai"] = {
            **(providers.get("openai") or {}),
            "provider": "openai",
            "total_tokens": openai_used,
            "cost_usd": float(external_totals.get("cost_usd", (providers.get("openai") or {}).get("cost_usd", 0.0)) or 0.0),
        }

    return {
        "period": p,
        "start_date": start,
        "end_date": end,
        "images_generated": images_generated,
        "providers": providers,
        "totals": totals,
        "remaining": {
            "openai_tokens": (openai_budget - openai_used) if openai_budget is not None else None,
            "gemini_tokens": (gemini_quota - gemini_used) if gemini_quota is not None else None,
        },
        "limits": {
            "openai_tokens": openai_budget,
            "gemini_tokens": gemini_quota,
        },
        "openai_graph": openai_graph,
        "local_images_graph": local_images_graph,
    }
