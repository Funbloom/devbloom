from unittest.mock import MagicMock, patch

from services.planning.planning_service import get_global_planning_view


@patch("services.planning.planning_service.get_supabase_client")
def test_get_global_planning_view_joins_projects_and_milestones(
    mock_get_supabase: MagicMock,
) -> None:
    supabase = MagicMock()
    mock_get_supabase.return_value = supabase

    def table_side_effect(name: str) -> MagicMock:
        table = MagicMock()
        if name == "projects":
            table.select.return_value.order.return_value.execute.return_value = MagicMock(
                data=[
                    {"project_key": "alpha", "display_name": "Alpha", "created_at": "t", "updated_at": "t"},
                    {"project_key": "beta", "display_name": "Beta", "created_at": "t", "updated_at": "t"},
                ]
            )
        elif name == "project_plans":
            table.select.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": "plan-1",
                        "project_key": "alpha",
                        "start_date": "2026-01-01",
                        "created_at": "t",
                        "updated_at": "t",
                    }
                ]
            )
        elif name == "planning_milestones":
            table.select.return_value.in_.return_value.order.return_value.execute.return_value = MagicMock(
                data=[
                    {
                        "id": "ms-1",
                        "project_plan_id": "plan-1",
                        "name": "M1",
                        "duration_weeks": 2,
                        "status": "todo",
                        "risk": "on_track",
                        "goals": [],
                        "order_index": 0,
                        "created_at": "t",
                        "updated_at": "t",
                    }
                ]
            )
        return table

    supabase.table.side_effect = table_side_effect

    result = get_global_planning_view()
    assert len(result["projects"]) == 2
    alpha = result["projects"][0]
    beta = result["projects"][1]
    assert alpha["project_key"] == "alpha"
    assert alpha["plan"]["id"] == "plan-1"
    assert len(alpha["milestones"]) == 1
    assert beta["plan"] is None
    assert beta["milestones"] == []
