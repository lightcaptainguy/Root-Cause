import json
import unittest
from datetime import datetime, timezone

from pydantic import ValidationError

from backend.config import Settings
from backend.contracts import (
    AnalysisJob, AnalysisResult, Attention, Box, ChatRequest, Classification,
    ImageAsset, Measurement, ObservationMetadata, Segmentation,
)


def metadata(**changes):
    value = {"zone_id": "zone-a", "image_kind": "closeup_leaf",
             "source": {"kind": "user_supplied"}}
    value.update(changes)
    return value


class ContractTests(unittest.TestCase):
    def test_missing_metadata_is_not_fabricated(self):
        observation = ObservationMetadata(**metadata())
        self.assertIsNone(observation.captured_at)
        self.assertIsNone(observation.crop_hint)
        self.assertEqual(observation.measurements, [])
        self.assertEqual(observation.model_dump(mode="json")["source"]["kind"], "user_supplied")

    def test_timestamp_requires_offset_and_normalizes_utc(self):
        with self.assertRaises(ValidationError):
            ObservationMetadata(**metadata(captured_at="2026-10-03T10:00:00"))
        observation = ObservationMetadata(**metadata(captured_at="2026-10-03T10:00:00+05:30"))
        self.assertEqual(observation.captured_at, datetime(2026, 10, 3, 4, 30, tzinfo=timezone.utc))

    def test_ground_truth_not_allowed_in_inference_metadata(self):
        with self.assertRaises(ValidationError):
            ObservationMetadata(**metadata(disease_label="late blight"))

    def test_null_is_not_zero_and_nonfinite_is_rejected(self):
        base = {"name": "soil_ph", "unit": "pH", "source": {"kind": "recorded"}}
        missing = Measurement(**base, value=None, quality="missing")
        self.assertIsNone(missing.value)
        valid = Measurement(**base, value=0, quality="valid")
        self.assertEqual(valid.value, 0)
        for value, quality in [(None, "valid"), (1, "missing"), (float("nan"), "valid")]:
            with self.subTest(value=value, quality=quality), self.assertRaises(ValidationError):
                Measurement(**base, value=value, quality=quality)

    def test_score_is_not_a_percent(self):
        with self.assertRaises(ValidationError):
            Classification(status="available", label="healthy", model_id="test", score=95)
        self.assertEqual(Classification().score, None)

    def test_unavailable_does_not_carry_invented_prediction(self):
        with self.assertRaises(ValidationError):
            Classification(label="healthy", score=0.99)
        with self.assertRaises(ValidationError):
            Segmentation(affected_fraction=0.1)

    def test_segmentation_requires_denominator(self):
        with self.assertRaises(ValidationError):
            Segmentation(status="available", method="experimental", mask_url="/api/assets/mask", affected_fraction=0.2)
        result = Segmentation(status="available", method="experimental", mask_url="/api/assets/mask",
                              affected_fraction=0.2, denominator="leaf_area")
        self.assertEqual(result.affected_fraction, 0.2)

    def test_box_geometry_and_local_assets(self):
        for coordinates in [(-1, 0, 10, 10), (0, 0, 0, 10), (10, 0, 5, 10)]:
            with self.subTest(coordinates=coordinates), self.assertRaises(ValidationError):
                Box(coordinates=coordinates, label="leaf", method="test")
        with self.assertRaises(ValidationError):
            ImageAsset(url="C:/private/file.png", width=100, height=100)

    def test_attention_needs_evidence_and_rule(self):
        self.assertEqual(Attention().status, "unknown")
        for fields in [{"status": "attention"}, {"status": "no_flag"},
                       {"status": "attention", "rule_version": "v1"}]:
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                Attention(**fields)

    def test_job_terminal_states_are_coherent(self):
        base = {"id": "job-1", "observation_id": "obs-1"}
        for fields in [{"status": "completed"}, {"status": "failed"},
                       {"status": "running", "result_id": "result-1"}]:
            with self.subTest(fields=fields), self.assertRaises(ValidationError):
                AnalysisJob(**base, **fields)
        self.assertEqual(AnalysisJob(**base, status="completed", result_id="result-1").result_id, "result-1")

    def test_unknown_result_round_trip(self):
        result = AnalysisResult(id="result-1", observation_id="obs-1", created_at=datetime.now(timezone.utc),
                                status="unsupported", limitations=["No aerial model configured"],
                                timings_ms={"queue": 1, "inference": 0, "total": 1})
        restored = AnalysisResult.model_validate_json(result.model_dump_json())
        self.assertEqual(restored.attention.status, "unknown")
        self.assertIsNone(restored.segmentation.affected_fraction)
        self.assertIsNone(json.loads(result.model_dump_json())["classification"]["score"])

    def test_chat_is_read_only_request_shape(self):
        with self.assertRaises(ValidationError):
            ChatRequest(message="explain", action="create_task")
        with self.assertRaises(ValidationError):
            ChatRequest(message="   ")

    def test_config_enforces_bounded_single_worker(self):
        self.assertEqual(Settings().queue_capacity, 16)
        self.assertIsNone(Settings().ollama_model)
        for overrides in [{"queue_capacity": 0}, {"inference_workers": 2}]:
            with self.subTest(overrides=overrides), self.assertRaises(ValidationError):
                Settings(**overrides)


if __name__ == "__main__":
    unittest.main()
