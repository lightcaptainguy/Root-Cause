"""Exercise formula metadata -> import -> analysis -> stored result through the live API.

All values/timestamps/images in the default demonstration are explicitly simulated.
Run with the backend listening; no Ollama call or sensor hardware is required.
"""
import argparse
import copy
import json
import math
import time
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
STAMP = "2026-10-03T10:00:00+05:30"
SOURCE = {"kind": "simulated", "name": "CWSI arithmetic demonstration", "reference": None}


def scenarios():
    base = {
        "zone_id": "formula-demo", "captured_at": STAMP, "image_kind": "closeup_leaf",
        "source": SOURCE, "notes": "SIMULATED formula demonstration; not field telemetry.",
        "measurements": [
            {"name": name, "value": value, "unit": "degC", "measured_at": STAMP,
             "source": SOURCE, "quality": "valid"}
            for name, value in [("canopy_temperature", 32), ("air_temperature", 30),
                                ("cwsi_lower_delta", -2), ("cwsi_upper_delta", 6)]
        ],
    }
    cases = []
    for name, status, value in [("valid", "available", .5), ("warmer_canopy", "available", .75),
                               ("missing_air", "unavailable", None),
                               ("out_of_sync", "unavailable", None),
                               ("invalid_baselines", "invalid", None)]:
        metadata = copy.deepcopy(base)
        metadata["notes"] += " Case: " + name
        if name == "warmer_canopy": metadata["measurements"][0]["value"] = 34
        if name == "missing_air":
            metadata["measurements"][1].update(value=None, quality="missing")
        if name == "out_of_sync":
            metadata["measurements"][1]["measured_at"] = "2026-10-03T10:00:05+05:30"
        if name == "invalid_baselines": metadata["measurements"][3]["value"] = -2
        cases.append((name, metadata, status, value))
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--examples-only", action="store_true", help="Write metadata without importing records")
    args = parser.parse_args()
    example_dir = ROOT / "config" / "demo_observations"
    example_dir.mkdir(parents=True, exist_ok=True)
    cases = scenarios()
    for name, metadata, _, _ in cases:
        (example_dir / ("cwsi_" + name + ".json")).write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if args.examples_only:
        print("Wrote five explicitly simulated metadata examples to " + str(example_dir))
        return
    image = (ROOT / "frontend" / "public" / "fixtures" / "leaf_landscape.png").read_bytes()
    rows = []
    with httpx.Client(base_url=args.url.rstrip("/"), timeout=30, trust_env=False) as client:
        client.post("/api/zones", json={"id":"formula-demo", "name":"Formula demo (SIMULATED)"}).raise_for_status()
        for name, metadata, expected_status, expected_value in cases:
            response = client.post("/api/observations", files={"image":("simulated_leaf.png", image, "image/png")},
                                   data={"metadata":json.dumps(metadata)})
            response.raise_for_status()
            observation = response.json()
            response = client.post("/api/observations/" + observation["id"] + "/analyze")
            response.raise_for_status()
            job_id = response.json()["job_id"]
            deadline = time.monotonic() + 30
            while True:
                response = client.get("/api/jobs/" + job_id)
                response.raise_for_status()
                job = response.json()
                if job["status"] == "failed": raise RuntimeError(job["error"])
                if job["status"] == "completed": break
                if time.monotonic() >= deadline: raise TimeoutError("Analysis did not complete")
                time.sleep(.1)
            response = client.get("/api/results/" + job["result_id"])
            response.raise_for_status()
            result = response.json()
            metric = next(m for m in result["metrics"] if m["formula_id"] == "cwsi")
            if metric["status"] != expected_status or (expected_value is None and metric["value"] is not None):
                raise AssertionError((name, metric))
            if expected_value is not None and not math.isclose(metric["value"], expected_value, abs_tol=1e-12):
                raise AssertionError((name, metric))
            rows.append({"case":name, "observation_id":observation["id"], "result_id":result["id"],
                         "association":observation["association"], "metric":metric,
                         "expected_status":expected_status, "expected_value":expected_value, "passed":True})
            print(f"{name}: {metric['status']} / {metric['value']} — PASS")
    report = ROOT / "docs" / "verification" / "formula-demo.json"
    report.write_text(json.dumps({"source":"Explicitly simulated inputs, not field validation", "cases":rows}, indent=2) + "\n", encoding="utf-8")
    print("Stored observations in Formula demo (SIMULATED); report: " + str(report))


if __name__ == "__main__":
    main()
