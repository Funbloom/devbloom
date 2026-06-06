from services.planning.planning_import_pkg.planning_import_mapper import (
    compute_duration_weeks,
    normalize_risk,
    normalize_status,
    parse_date_value,
    split_deliverable_titles,
)
from services.planning.planning_import_pkg.planning_import_parser import parse_planning_text

SAMPLE_TEMPLATE = """
Project Status
Game: My Game
Milestone: Alpha
Start date: 2026-01-01
Delivery date: 2026-01-22
Goals:
● Ship core loop
● Polish UI
Objective\tDeliverable\tStatus\tRisk\tOwner\tDue Date
Core gameplay\tPlayer movement\tIn Progress\tOn Track\tAlex\t2026-01-15
Core gameplay\tCombat system\tIn Progress\tOn Track\tAlex\t2026-01-15
Milestone: Beta
Start date: 2026-01-23
Delivery date: 2026-02-13
Goals:
● Content complete
Objective\tDeliverable\tStatus\tRisk\tOwner\tDue Date
Content\tLevel 1\tTodo\tCaution\tSam\t2026-02-01
"""


def test_normalize_status_and_risk() -> None:
    assert normalize_status("Completed")[0] == "completed"
    assert normalize_status("In Progress")[0] == "in_progress"
    assert normalize_risk("On Track")[0] == "on_track"
    assert normalize_risk("unknown")[0] == "on_track"


def test_parse_date_value_iso() -> None:
    parsed, warning = parse_date_value("2026-06-04")
    assert parsed == "2026-06-04"
    assert warning is None


def test_parse_date_value_dot_separated() -> None:
    parsed, warning = parse_date_value("06.01.2026")
    assert parsed == "2026-06-01"
    assert warning is None


def test_compute_duration_weeks() -> None:
    weeks, warnings = compute_duration_weeks("2026-01-01", "2026-01-22", "Alpha")
    assert weeks == 3
    assert warnings == []


def test_compute_duration_weeks_missing_dates_warns() -> None:
    weeks, warnings = compute_duration_weeks(None, None, "Alpha")
    assert weeks == 1
    assert len(warnings) == 1


def test_split_deliverable_titles_bullets() -> None:
    titles = split_deliverable_titles("● Player movement\n● Combat system")
    assert titles == ["Player movement", "Combat system"]


M00_WITH_TABLE_TEMPLATE = """
Game: Solitaire
Milestone: M00-Kickoff
Delivery date: 06.01.2026
Goals:
Core loop documented and approved
Game mode(s) defined and agreed upon
Initial design documentation submitted
Objective\tDeliverable\tStatus\tRisk\tOwner\tDue Date
GDD v.01\tLiving Document: GDD Solitaire\tCompleted\tOn Track\tAlain Dessureaux\tJun 1, 2026
UI/UX spec v0.1\tLiving Document: UI-UX Solitaire\tCompleted\tOn Track\tAlain Dessureaux\tJun 1, 2026
Art design doc v.01\tLiving Document: Solitaire - Art Direction v0.1\tCompleted\tOn Track\tHeather Knudson\tJun 1, 2026
Milestone: M01-Core Playable Loop
Delivery date: 06.12.2026
Goals:
Main menu placeholder functional
"""


def test_parse_m00_deliverables_from_inline_table() -> None:
    data, warnings = parse_planning_text(M00_WITH_TABLE_TEMPLATE)
    assert len(data.milestones) == 2
    kickoff = data.milestones[0]
    assert kickoff.name == "M00-Kickoff"
    assert len(kickoff.deliverables) == 3
    assert kickoff.deliverables[0].title.startswith("GDD v.01:")
    assert kickoff.deliverables[0].status == "completed"
    assert kickoff.deliverables[0].owner == "Alain Dessureaux"
    assert kickoff.deliverables[0].due_date == "2026-06-01"
    assert kickoff.deliverables[2].owner == "Heather Knudson"
    core = data.milestones[1]
    assert len(core.deliverables) == 0
    assert not any("Could not parse date 'Date'" in w for w in warnings)


DELIVERY_ONLY_TEMPLATE = """
Game: Solitaire
Milestone: M00-Kickoff
Delivery date: 06.01.2026
Goals:
● Kickoff complete
Milestone: M01-Core Playable Loop
Delivery date: 06.12.2026
Goals:
● Core loop
"""


def test_parse_delivery_only_milestones() -> None:
    data, warnings = parse_planning_text(DELIVERY_ONLY_TEMPLATE)
    assert len(data.milestones) == 2
    kickoff = data.milestones[0]
    assert kickoff.delivery_date == "2026-06-01"
    assert kickoff.start_date == "2026-05-25"
    assert kickoff.duration_weeks >= 1
    core = data.milestones[1]
    assert core.start_date == "2026-06-01"
    assert core.delivery_date == "2026-06-12"
    assert core.duration_weeks == 2
    assert not any("Could not parse date" in w for w in warnings)


def test_parse_planning_text_sample() -> None:
    data, warnings = parse_planning_text(SAMPLE_TEMPLATE)
    assert data.project_name == "My Game"
    assert len(data.milestones) == 2
    alpha = data.milestones[0]
    assert alpha.name == "Alpha"
    assert alpha.duration_weeks >= 1
    assert alpha.goals == ["Ship core loop", "Polish UI"]
    assert len(alpha.deliverables) == 2
    assert alpha.deliverables[0].owner == "Alex"
    assert alpha.deliverables[0].due_date == "2026-01-15"
    assert isinstance(warnings, list)
