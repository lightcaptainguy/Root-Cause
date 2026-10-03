"""Validated API wire contracts. No inference, sensor fabrication, or I/O."""

from datetime import datetime, timezone
from enum import StrEnum
from typing import Annotated, Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field, model_validator

FiniteNumber = Annotated[float, Field(allow_inf_nan=False)]
Score = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]
Identifier = Annotated[str, Field(min_length=1, max_length=200)]


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True)

    @model_validator(mode="after")
    def normalize_timestamps(self):
        for field in type(self).model_fields:
            value = getattr(self, field)
            if isinstance(value, datetime):
                if value.tzinfo is None or value.utcoffset() is None:
                    raise ValueError(f"{field} must include a timezone offset")
                # Bypass assignment validation to avoid recursively calling this validator.
                object.__setattr__(self, field, value.astimezone(timezone.utc))
        return self


T = TypeVar("T")


class Items(WireModel, Generic[T]):
    items: list[T]


class SourceKind(StrEnum):
    DATASET = "dataset"
    RECORDED = "recorded"
    LIVE = "live"
    SIMULATED = "simulated"
    USER_SUPPLIED = "user_supplied"


class Source(WireModel):
    kind: SourceKind
    name: Annotated[str, Field(max_length=300)] | None = None
    reference: Annotated[str, Field(max_length=2000)] | None = None


class ImageKind(StrEnum):
    CLOSEUP_LEAF = "closeup_leaf"
    AERIAL = "aerial"
    OTHER = "other"


class Measurement(WireModel):
    name: Identifier
    value: FiniteNumber | None
    unit: Annotated[str, Field(min_length=1, max_length=100)]
    measured_at: datetime | None = None
    source: Source
    quality: Literal["valid", "stale", "missing", "invalid"]

    @model_validator(mode="after")
    def check_missing_value(self):
        if self.quality in {"valid", "stale"} and self.value is None:
            raise ValueError("valid/stale measurements require a value")
        if self.quality == "missing" and self.value is not None:
            raise ValueError("missing measurements must have null value")
        return self


class ObservationMetadata(WireModel):
    zone_id: Identifier
    captured_at: datetime | None = None
    image_kind: ImageKind
    crop_hint: Identifier | None = None
    source: Source
    measurements: Annotated[list[Measurement], Field(max_length=256)] = Field(default_factory=list)
    notes: Annotated[str, Field(max_length=4000)] | None = None


class Zone(WireModel):
    id: Identifier
    name: Identifier


class ImageAsset(WireModel):
    url: str
    width: Annotated[int, Field(gt=0)]
    height: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def check_local_url(self):
        if not self.url.startswith("/api/assets/") or ".." in self.url or "?" in self.url:
            raise ValueError("asset URL must be a backend-relative /api/assets/ path")
        return self


class Association(WireModel):
    status: Literal["associated", "unassociated", "partial"] = "unassociated"
    method: str | None = None
    deltas_ms: dict[str, FiniteNumber] = Field(default_factory=dict)


class Observation(ObservationMetadata):
    id: Identifier
    received_at: datetime
    image: ImageAsset
    association: Association = Field(default_factory=Association)
    latest_result_id: Identifier | None = None


class CapabilityStatus(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    UNSUPPORTED = "unsupported"
    FAILED = "failed"


class Classification(WireModel):
    status: CapabilityStatus = CapabilityStatus.UNAVAILABLE
    crop: str | None = None
    label: str | None = None
    score: Score | None = None
    model_id: str | None = None

    @model_validator(mode="after")
    def check_evidence(self):
        if self.status == CapabilityStatus.AVAILABLE:
            if not self.label or not self.model_id or self.score is None:
                raise ValueError("available classification requires label, score and model_id")
        elif any(v is not None for v in (self.crop, self.label, self.score, self.model_id)):
            raise ValueError("unavailable classification must not carry predictions")
        return self


class Box(WireModel):
    coordinates: tuple[FiniteNumber, FiniteNumber, FiniteNumber, FiniteNumber]
    label: Identifier
    score: Score | None = None
    method: Identifier

    @model_validator(mode="after")
    def check_geometry(self):
        x1, y1, x2, y2 = self.coordinates
        if min(x1, y1) < 0 or x2 <= x1 or y2 <= y1:
            raise ValueError("box coordinates must be nonnegative, nonempty xyxy pixels")
        return self


class Localization(WireModel):
    status: CapabilityStatus = CapabilityStatus.UNAVAILABLE
    method: str | None = None
    boxes: list[Box] = Field(default_factory=list)

    @model_validator(mode="after")
    def check_evidence(self):
        if self.status == CapabilityStatus.AVAILABLE and not self.method:
            raise ValueError("available localization requires a method")
        if self.status != CapabilityStatus.AVAILABLE and (self.boxes or self.method):
            raise ValueError("unavailable localization must not carry boxes/method")
        return self


class Segmentation(WireModel):
    status: CapabilityStatus = CapabilityStatus.UNAVAILABLE
    method: str | None = None
    mask_url: str | None = None
    affected_fraction: Score | None = None
    denominator: Literal["leaf_area", "image_area"] | None = None

    @model_validator(mode="after")
    def check_evidence(self):
        if self.status == CapabilityStatus.AVAILABLE:
            if not self.method or not self.mask_url or not self.mask_url.startswith("/api/assets/"):
                raise ValueError("available segmentation requires method and local mask URL")
            if self.affected_fraction is not None and self.denominator is None:
                raise ValueError("affected_fraction requires an explicit area denominator")
            if self.affected_fraction is None and self.denominator is not None:
                raise ValueError("area denominator requires an affected_fraction")
        elif any(v is not None for v in (self.method, self.mask_url, self.affected_fraction, self.denominator)):
            raise ValueError("unavailable segmentation must not carry inferred areas or masks")
        return self


class Metric(WireModel):
    name: Identifier
    value: FiniteNumber | None
    unit: str
    formula_id: Identifier
    formula_version: Identifier
    input_refs: list[str] = Field(default_factory=list)
    status: Literal["available", "unavailable", "invalid"]

    @model_validator(mode="after")
    def check_value(self):
        if (self.status == "available") != (self.value is not None):
            raise ValueError("only available metrics carry a value")
        return self


class Attention(WireModel):
    status: Literal["attention", "no_flag", "unknown"] = "unknown"
    reasons: list[str] = Field(default_factory=list)
    rule_version: str | None = None

    @model_validator(mode="after")
    def check_rule(self):
        if self.status != "unknown" and not self.rule_version:
            raise ValueError("evaluated attention requires a rule version")
        if self.status == "attention" and not self.reasons:
            raise ValueError("attention requires at least one reason")
        return self


class AttentionItem(Attention):
    observation_id: Identifier
    zone_id: Identifier


class Timings(WireModel):
    queue: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    inference: Annotated[float, Field(ge=0, allow_inf_nan=False)]
    total: Annotated[float, Field(ge=0, allow_inf_nan=False)]


class AnalysisResult(WireModel):
    id: Identifier
    observation_id: Identifier
    created_at: datetime
    status: Literal["completed", "partial", "unsupported", "failed"]
    classification: Classification = Field(default_factory=Classification)
    localization: Localization = Field(default_factory=Localization)
    segmentation: Segmentation = Field(default_factory=Segmentation)
    metrics: list[Metric] = Field(default_factory=list)
    attention: Attention = Field(default_factory=Attention)
    limitations: list[str] = Field(default_factory=list)
    timings_ms: Timings


class ApiError(WireModel):
    code: Identifier
    message: str
    details: Any = None


class ErrorEnvelope(WireModel):
    error: ApiError


class AnalysisJob(WireModel):
    id: Identifier
    observation_id: Identifier
    status: Literal["queued", "running", "completed", "failed"]
    result_id: Identifier | None = None
    error: ApiError | None = None

    @model_validator(mode="after")
    def check_terminal_state(self):
        if self.status == "completed" and (not self.result_id or self.error is not None):
            raise ValueError("completed job requires result_id and no error")
        if self.status == "failed" and (self.error is None or self.result_id is not None):
            raise ValueError("failed job requires error and no result_id")
        if self.status in {"queued", "running"} and (self.result_id is not None or self.error is not None):
            raise ValueError("pending job must not carry terminal fields")
        return self


class AnalyzeAccepted(WireModel):
    job_id: Identifier
    observation_id: Identifier
    status: Literal["queued", "running"]


class Health(WireModel):
    status: Literal["ok", "degraded"]
    vision_ready: bool
    ollama_ready: bool
    capabilities: dict[str, bool]


class EvidenceItem(WireModel):
    kind: Literal["observation", "result", "reference", "formula"]
    id: Identifier
    title: str
    observation_id: Identifier | None = None
    result_id: Identifier | None = None


class ChatRequest(WireModel):
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    zone_id: Identifier | None = None
    observation_id: Identifier | None = None
    conversation_id: Identifier | None = None

    @model_validator(mode="after")
    def check_message(self):
        if not self.message.strip():
            raise ValueError("message must contain non-whitespace text")
        return self


class ChatResponse(WireModel):
    conversation_id: Identifier
    answer: str
    evidence: list[EvidenceItem] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
