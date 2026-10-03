"""Export reviewable JSON Schemas from the authoritative Python contracts."""

import json

from . import contracts
from .config import PROJECT_ROOT

EXPORT_MODELS = (
    contracts.ObservationMetadata, contracts.Observation, contracts.AnalysisResult,
    contracts.AnalysisJob, contracts.AnalyzeAccepted, contracts.ChatRequest,
    contracts.ChatResponse, contracts.AttentionItem, contracts.Health, contracts.Zone,
    contracts.ApiError, contracts.ErrorEnvelope,
)


def main():
    output = PROJECT_ROOT / "docs" / "schemas"
    output.mkdir(parents=True, exist_ok=True)
    for model in EXPORT_MODELS:
        path = output / f"{model.__name__}.schema.json"
        path.write_text(json.dumps(model.model_json_schema(), indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(EXPORT_MODELS)} JSON Schemas to {output}")


if __name__ == "__main__":
    main()
