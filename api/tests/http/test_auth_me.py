def test_auth_me_get_returns_overridden_user(client):
    r = client.get("/auth/me")
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "test@example.com"
    assert data["is_admin"] is False
    assert data["id"] == "test-user-1"
