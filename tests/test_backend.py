import io
import json
import tempfile
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from backend.agronomy import attention_for, calculate_metrics
from backend.app import create_app
from backend.association import associate, interpolate
from backend.config import Settings
from backend.contracts import AnalysisJob, Classification, Measurement, ObservationMetadata, Zone
from backend.errors import ServiceError
from backend.ingestion import import_image
from backend.storage import Store


class NoVision:
    ready = False
    def classify(self, path, kind):
        return Classification(status="unsupported" if kind == "aerial" else "unavailable"), ["Test provider; no model"]


def image_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (120, 80), "green").save(buffer, "PNG")
    return buffer.getvalue()


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.settings = Settings(data_dir=Path(self.directory.name), frontend_dist=Path(self.directory.name)/"missing")
        self.app = create_app(self.settings, NoVision())
        self.client_context = TestClient(self.app)
        self.client = self.client_context.__enter__()
        self.client.post("/api/zones", json={"id":"zone-a","name":"Zone A"})

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.directory.cleanup()

    def upload(self, kind="closeup_leaf", **changes):
        metadata = {"zone_id":"zone-a","image_kind":kind,"source":{"kind":"user_supplied"}, **changes}
        return self.client.post("/api/observations", files={"image":("leaf.png",image_bytes(),"image/png")},
                                data={"metadata":json.dumps(metadata)})

    def wait_result(self, observation_id):
        submitted = self.client.post(f"/api/observations/{observation_id}/analyze")
        self.assertEqual(submitted.status_code, 202, submitted.text)
        deadline = time.monotonic()+5
        while time.monotonic() < deadline:
            job = self.client.get("/api/jobs/"+submitted.json()["job_id"]).json()
            if job["status"] in {"completed","failed"}:
                break
            time.sleep(0.01)
        self.assertEqual(job["status"], "completed", job)
        return self.client.get("/api/results/"+job["result_id"]).json()

    def test_upload_analyze_save_asset_and_restart(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.text)
        observation = response.json()
        self.assertIsNone(observation["captured_at"])
        self.assertEqual(observation["image"]["width"],120)
        self.assertEqual(self.client.get(observation["image"]["url"]).status_code,200)
        result = self.wait_result(observation["id"])
        self.assertIsNone(result["classification"]["score"])
        self.assertEqual(result["attention"]["status"],"unknown")
        restored = Store(self.settings.data_dir).observation(observation["id"])
        self.assertEqual(restored.latest_result_id,result["id"])
        self.assertEqual(Store(self.settings.data_dir).result(result["id"]).id,result["id"])

    def test_aerial_is_unsupported_not_healthy(self):
        result = self.wait_result(self.upload("aerial").json()["id"])
        self.assertEqual(result["status"],"unsupported")
        self.assertEqual(result["attention"]["status"],"unknown")
        self.assertIsNone(result["segmentation"]["affected_fraction"])

    def test_reanalysis_keeps_previous_result(self):
        observation = self.upload().json()
        first = self.wait_result(observation["id"])
        second = self.wait_result(observation["id"])
        self.assertNotEqual(first["id"],second["id"])
        self.assertEqual(self.client.get("/api/results/"+first["id"]).status_code,200)

    def test_bad_metadata_and_missing_image(self):
        self.assertEqual(self.upload(disease_label="known truth").status_code,400)
        self.assertEqual(self.upload(captured_at="2026-10-03T12:00:00").status_code,400)
        response = self.client.post("/api/observations",data={"metadata":"{}"})
        self.assertEqual(response.status_code,400)
        self.assertEqual(response.json()["error"]["code"],"INVALID_INPUT")

    def test_bad_image_and_unknown_zone(self):
        metadata = {"zone_id":"zone-a","image_kind":"closeup_leaf","source":{"kind":"user_supplied"}}
        response = self.client.post("/api/observations",files={"image":("bad.png",b"not-image","image/png")},data={"metadata":json.dumps(metadata)})
        self.assertEqual(response.status_code,400)
        self.assertEqual(self.upload(zone_id="missing").status_code,400)

    def test_limits_and_asset_path(self):
        tiny = self.settings.model_copy(update={"max_upload_bytes":5})
        with self.assertRaises(ServiceError) as caught:
            import_image(self.app.state.store,tiny,image_bytes(),ObservationMetadata(zone_id="zone-a",image_kind="closeup_leaf",source={"kind":"user_supplied"}))
        self.assertEqual(caught.exception.status,413)
        self.assertEqual(self.client.get("/api/assets/not-found").status_code,404)

    def test_chat_unconfigured_and_no_fake_answer(self):
        response = self.client.post("/api/chat",json={"message":"Explain this"})
        self.assertEqual(response.status_code,503)
        self.assertNotIn("answer",response.json())

    def test_restart_fails_incomplete_jobs(self):
        observation = self.upload().json()
        store = self.app.state.store
        store.save_job(AnalysisJob(id="pending",observation_id=observation["id"],status="queued"))
        store.fail_interrupted_jobs()
        self.assertEqual(store.job("pending").status,"failed")


class AssociationTests(unittest.TestCase):
    def test_tolerance_missing_and_interpolation(self):
        now = datetime(2026,10,3,12,tzinfo=timezone.utc)
        source={"kind":"recorded"}
        before=Measurement(name="temperature",unit="degC",value=20,quality="valid",measured_at=now,source=source)
        after=Measurement(name="temperature",unit="degC",value=24,quality="valid",measured_at=now+timedelta(seconds=2),source=source)
        self.assertEqual(interpolate(before,after,now+timedelta(seconds=1),2000),22)
        self.assertIsNone(interpolate(before,after,now+timedelta(seconds=1),1000))
        metadata=ObservationMetadata(zone_id="zone-a",image_kind="closeup_leaf",source=source,captured_at=now,measurements=[before,after])
        self.assertEqual(associate(metadata,1000).deltas_ms["temperature"],0)
        metadata.captured_at=None
        self.assertEqual(associate(metadata,1000).status,"unassociated")

    def test_cwsi_uses_only_synchronized_valid_units(self):
        directory=tempfile.TemporaryDirectory()
        try:
            store=Store(Path(directory.name)); store.add_zone(Zone(id="z",name="Z"))
            now=datetime.now(timezone.utc)
            names=("canopy_temperature","air_temperature","cwsi_lower_delta","cwsi_upper_delta")
            measurements=[Measurement(name=n,value=v,unit="degC",measured_at=now,quality="valid",source={"kind":"recorded"})
                          for n,v in zip(names,[30,25,0,10])]
            metadata=ObservationMetadata(zone_id="z",image_kind="closeup_leaf",source={"kind":"recorded"},captured_at=now,measurements=measurements)
            observation=import_image(store,Settings(data_dir=Path(directory.name)),image_bytes(),metadata)
            self.assertEqual(calculate_metrics(observation)[0].value,0.5)
            observation.association.deltas_ms={}
            self.assertIsNone(calculate_metrics(observation)[0].value)
        finally:
            directory.cleanup()

    def test_healthy_label_not_flagged_as_disease(self):
        result=attention_for(Classification(status="available",label="Healthy Tomato Plant",crop="Tomato",score=0.99,model_id="test"),0.8)
        self.assertEqual(result.status,"no_flag")


if __name__ == "__main__":
    unittest.main()
