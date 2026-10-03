"""Explicit local runtime defaults; no devices or measurements are invented."""

from pathlib import Path
from typing import Annotated

from pydantic import Field

from .contracts import WireModel

PROJECT_ROOT = Path(__file__).resolve().parents[1]


class Settings(WireModel):
    host: str = "127.0.0.1"
    port: Annotated[int, Field(ge=1, le=65535)] = 8000
    data_dir: Path = PROJECT_ROOT / "data"
    frontend_dist: Path = PROJECT_ROOT / "frontend" / "dist"
    max_upload_bytes: Annotated[int, Field(gt=0)] = 20 * 1024 * 1024
    max_image_pixels: Annotated[int, Field(gt=0)] = 40_000_000
    queue_capacity: Annotated[int, Field(gt=0, le=1024)] = 16
    inference_workers: Annotated[int, Field(ge=1, le=1)] = 1
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str | None = None
    vision_model_path: Path | None = None
    vision_config_dir: Path = PROJECT_ROOT / "models" / "plant_classifier"
    zones: list[dict[str, str]] = Field(default_factory=list)
    attention_score_threshold: Annotated[float, Field(ge=0, le=1)] = 0.8
    experimental_overlays: bool = False
    references_dir: Path = PROJECT_ROOT / "config" / "references"
    telemetry_tolerance_ms: Annotated[int, Field(ge=0)] = 1000
    interpolation_max_gap_ms: Annotated[int, Field(gt=0)] = 2000


def load_settings(path: Path | None = None) -> Settings:
    """Load explicit JSON overrides. No directory creation or network calls."""
    if path is None:
        return Settings()
    return Settings.model_validate_json(path.read_text(encoding="utf-8"))
