"""Exercise library, muscle groups, training types and goals."""

from ..library import public_library
from ..router import route


@route("GET", "/api/library", auth=False)
def get_library(ctx):
    return public_library()
