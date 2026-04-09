def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "service": "gamedev-api"}


def test_auth_me_head_no_auth_required(client):
    r = client.head("/auth/me")
    assert r.status_code == 200
