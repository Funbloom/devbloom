from services.core.games_registry import get_game, list_games, list_pipelines


def test_list_games_from_per_game_manifests():
    games = list_games()
    keys = {g["key"] for g in games}
    assert "pocket_voyager" in keys
    assert "solitaire" in keys


def test_list_pipelines_pocket_voyager():
    pipelines = list_pipelines("pocket_voyager")
    pipeline_keys = {p["key"] for p in pipelines}
    assert "gift_images" in pipeline_keys
    assert "cities" in pipeline_keys
    assert "narrative" in pipeline_keys


def test_get_game_missing():
    assert get_game("not_a_real_game") is None
