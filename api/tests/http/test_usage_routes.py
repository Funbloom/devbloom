from routers import usage_routes


def test_usage_summary_route_returns_payload(client, monkeypatch):
    monkeypatch.setattr(
        usage_routes,
        "get_usage_summary",
        lambda user_id, period: {
            "period": period,
            "images_generated": 4,
            "providers": {"openai": {"provider": "openai", "requests_count": 4, "total_tokens": 200, "input_tokens": 80, "output_tokens": 120, "cost_usd": 0.4}},
            "totals": {"requests_count": 4, "total_tokens": 200, "input_tokens": 80, "output_tokens": 120, "cost_usd": 0.4},
            "remaining": {"openai_tokens": 800, "gemini_tokens": None},
            "limits": {"openai_tokens": 1000, "gemini_tokens": None},
            "user_id": user_id,
        },
    )

    response = client.get("/usage/summary?period=month")
    assert response.status_code == 200
    payload = response.json()
    assert payload["period"] == "month"
    assert payload["images_generated"] == 4
    assert payload["remaining"]["openai_tokens"] == 800


def test_usage_providers_route_supports_year(client, monkeypatch):
    monkeypatch.setattr(
        usage_routes,
        "get_provider_usage",
        lambda user_id, period: {
            "period": period,
            "providers": {"gemini": {"provider": "gemini", "requests_count": 2, "total_tokens": 50, "input_tokens": 20, "output_tokens": 30, "cost_usd": 0.1}},
            "totals": {"requests_count": 2, "total_tokens": 50, "input_tokens": 20, "output_tokens": 30, "cost_usd": 0.1},
            "user_id": user_id,
        },
    )

    response = client.get("/usage/providers?period=year")
    assert response.status_code == 200
    payload = response.json()
    assert payload["period"] == "year"
    assert payload["providers"]["gemini"]["total_tokens"] == 50
