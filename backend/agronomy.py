"""Supplied-spec CWSI and explicit demo attention rule; no treatment prescription."""

from .contracts import Attention, Metric

CWSI_INPUTS = ("canopy_temperature", "air_temperature", "cwsi_lower_delta", "cwsi_upper_delta")


def calculate_metrics(observation):
    chosen = {}
    for name in CWSI_INPUTS:
        candidates = [m for m in observation.measurements if m.name == name and m.quality == "valid" and m.unit == "degC"]
        # Measurements with unknown capture time cannot establish contemporaneous stress.
        if name not in observation.association.deltas_ms:
            continue
        candidates = [m for m in candidates if m.measured_at is not None and
                      abs((m.measured_at - observation.captured_at).total_seconds()*1000 - observation.association.deltas_ms[name]) < 0.001]
        if candidates:
            chosen[name] = candidates[0].value
    metric = dict(name="CWSI", unit="index", formula_id="cwsi", formula_version="spec-v1",
                  input_refs=[f"{observation.id}:measurement:{name}" for name in chosen])
    if len(chosen) != len(CWSI_INPUTS):
        return [Metric(**metric, value=None, status="unavailable")]
    lower, upper = chosen["cwsi_lower_delta"], chosen["cwsi_upper_delta"]
    if upper <= lower:
        return [Metric(**metric, value=None, status="invalid")]
    value = ((chosen["canopy_temperature"] - chosen["air_temperature"]) - lower) / (upper - lower)
    # Preserve raw index; do not silently clamp unusual values into a healthy-looking interval.
    return [Metric(**metric, value=value, status="available")]


def attention_for(classification, threshold):
    if classification.status != "available":
        return Attention(reasons=["No supported classification is available"])
    if classification.score < threshold:
        return Attention(reasons=["Model score is below the configured review threshold"])
    label = classification.label.lower()
    if label == "healthy" or label.endswith("___healthy") or label.startswith("healthy "):
        return Attention(status="no_flag", rule_version="demo-classifier-v1",
                         reasons=["No disease flag from this classifier; this does not establish field health"])
    return Attention(status="attention", rule_version="demo-classifier-v1",
                     reasons=[f"Classifier suggests {classification.label}; verify the image and seek qualified assessment"])
