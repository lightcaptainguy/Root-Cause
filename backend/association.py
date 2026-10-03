"""Nonblocking, provenance-preserving association of supplied measurements."""

from .contracts import Association


def associate(metadata, tolerance_ms):
    if metadata.captured_at is None:
        return Association()
    eligible = [m for m in metadata.measurements if m.quality in {"valid", "stale"}]
    selected = {}
    for measurement in eligible:
        # Stale samples remain source evidence, but are not synchronized inputs.
        if measurement.measured_at is None or measurement.quality != "valid":
            continue
        delta = (measurement.measured_at - metadata.captured_at).total_seconds() * 1000
        if abs(delta) <= tolerance_ms:
            if measurement.name not in selected or abs(delta) < abs(selected[measurement.name]):
                selected[measurement.name] = delta
    if not selected:
        return Association()
    expected = {m.name for m in metadata.measurements}
    return Association(status="associated" if set(selected) == expected else "partial",
                       method="nearest_supplied_timestamp", deltas_ms=selected)


def interpolate(before, after, target, maximum_gap_ms):
    """Explicit opt-in numerical helper; does not mutate original samples."""
    if before.name != after.name or before.unit != after.unit:
        return None
    if before.quality != "valid" or after.quality != "valid":
        return None
    if before.measured_at is None or after.measured_at is None:
        return None
    gap = (after.measured_at - before.measured_at).total_seconds() * 1000
    if not 0 < gap <= maximum_gap_ms or not before.measured_at <= target <= after.measured_at:
        return None
    ratio = (target - before.measured_at).total_seconds() * 1000 / gap
    return before.value + (after.value - before.value) * ratio
