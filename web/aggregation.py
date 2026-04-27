"""Backward-compat shim. backend.shared.aggregation 재노출."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.shared.aggregation import (  # noqa: F401
    aggregate,
    sort_groups,
    sort_variants,
    sort_categories,
    _group_sort_key,
    _variant_sort_key,
    _cat_sort_key,
)
