from unittest.mock import MagicMock, patch


def test_list_projects_ok(client):
    execute_result = MagicMock()
    execute_result.data = [
        {
            "project_key": "p1",
            "display_name": "Project One",
            "created_at": None,
            "updated_at": None,
        }
    ]

    order_mock = MagicMock()
    order_mock.execute.return_value = execute_result

    select_mock = MagicMock()
    select_mock.order.return_value = order_mock

    table_mock = MagicMock()
    table_mock.select.return_value = select_mock

    supabase_mock = MagicMock()
    supabase_mock.table.return_value = table_mock

    with (
        patch("routers.projects.get_supabase_client", return_value=supabase_mock),
        patch("routers.projects.get_local_project_path", return_value=""),
    ):
        r = client.get("/projects")

    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["project_key"] == "p1"
    assert body[0]["display_name"] == "Project One"
    assert body[0]["project_path"] == ""
    supabase_mock.table.assert_called_with("projects")


def test_create_project_requires_admin(client):
    r = client.post(
        "/projects",
        json={"project_key": "valid_key", "display_name": "Test"},
    )
    assert r.status_code == 403


def test_create_project_invalid_key(admin_client):
    with patch("routers.projects.get_supabase_client") as m:
        r = admin_client.post(
            "/projects",
            json={"project_key": "Invalid Key!", "display_name": "x"},
        )
    assert r.status_code == 400
    m.assert_not_called()
