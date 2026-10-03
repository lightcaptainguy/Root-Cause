"""Exercise genuine imports -> jobs -> results, optionally real Ollama, with no UI."""

import argparse
import json
import sys
import time
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from backend.app import create_app
from backend.config import PROJECT_ROOT, load_settings

parser=argparse.ArgumentParser()
parser.add_argument("--chat",action="store_true")
args=parser.parse_args()
settings=load_settings(PROJECT_ROOT/"config"/"demo.json")
app=create_app(settings)
manifest=json.loads((PROJECT_ROOT/"data"/"evaluation"/"manifest.json").read_text())
rows=[]
with TestClient(app) as client:
    # Exercise a healthy image, a disease image, and a crop from a different label family.
    for sample in [manifest["samples"][index] for index in (0,3,6)]:
        metadata={"zone_id":"demo-zone","image_kind":"closeup_leaf",
                  "source":{"kind":"dataset","name":"PlantVillage","reference":sample["source_url"]}}
        image=(PROJECT_ROOT/"data"/"evaluation"/sample["file"]).read_bytes()
        response=client.post("/api/observations",files={"image":("sample.jpg",image,"image/jpeg")},data={"metadata":json.dumps(metadata)})
        response.raise_for_status(); observation=response.json()
        job=client.post(f"/api/observations/{observation['id']}/analyze"); job.raise_for_status()
        deadline=time.monotonic()+30
        while time.monotonic()<deadline:
            state=client.get("/api/jobs/"+job.json()["job_id"]).json()
            if state["status"] in {"completed","failed"}: break
            time.sleep(0.02)
        if state["status"] != "completed": raise RuntimeError(state)
        result=client.get("/api/results/"+state["result_id"]).json()
        rows.append({"observation_id":observation["id"],"result_id":result["id"],"label":result["classification"]["label"],
                     "score":result["classification"]["score"],"timings_ms":result["timings_ms"],
                     "segmentation_method":result["segmentation"]["method"],"capture_time":observation["captured_at"]})
    chat_result=None
    chat_elapsed_ms=None
    if args.chat:
        chat_started=time.perf_counter()
        response=client.post("/api/chat",json={"message":"Explain the stored image result and say which soil and temperature measurements are missing. Do not infer those values.",
                        "zone_id":"demo-zone","observation_id":rows[0]["observation_id"]})
        if response.status_code != 200:
            print(response.text)
        response.raise_for_status(); chat_result=response.json()
        chat_elapsed_ms=(time.perf_counter()-chat_started)*1000
    report={"health":client.get("/api/health").json(),"results":rows,"chat":chat_result,"chat_elapsed_ms":chat_elapsed_ms}
    output=PROJECT_ROOT/"docs"/"verification"/"backend-smoke.json"
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))
