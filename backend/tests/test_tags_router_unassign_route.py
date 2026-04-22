from app.api.tags import router


def _route_index(path: str, method: str) -> int:
    for index, route in enumerate(router.routes):
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return index
    raise AssertionError(f"Route not found: {method} {path}")


def test_unassign_route_is_checked_before_dynamic_tag_delete_route():
    dynamic_delete_index = _route_index("/tags/{tag_id}", "DELETE")
    unassign_index = _route_index("/tags/unassign", "DELETE")

    assert unassign_index < dynamic_delete_index
