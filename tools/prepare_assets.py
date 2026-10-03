"""Download pinned model artifacts and a small real PlantVillage smoke-test set."""

import argparse
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = "onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX"
REVISION = "95110a1ffcc188d1b5a36524d52e303e40c2403d"
MODEL_SHA256 = "c209f96f0a87a265b0ff6765c2e84d48038a7d8b8692d7629445b4513c344eb7"


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent":"Root-Cause-hackathon-prototype"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def model():
    directory = ROOT / "models" / "plant_classifier"
    directory.mkdir(parents=True, exist_ok=True)
    files = {"config.json":"config.json","preprocessor_config.json":"preprocessor_config.json","onnx/model.onnx":"model.onnx"}
    manifest = {"repository":MODEL,"revision":REVISION,"artifacts":[]}
    for remote, local in files.items():
        url = f"https://www.huggingface.co/{MODEL}/resolve/{REVISION}/{remote}"
        path = directory / local
        if not path.is_file():
            payload = get(url)
            digest = hashlib.sha256(payload).hexdigest()
            if local == "model.onnx" and digest != MODEL_SHA256:
                raise ValueError("ONNX model checksum differs from verified artifact")
            path.write_bytes(payload)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if local == "model.onnx" and digest != MODEL_SHA256:
            raise ValueError("Existing ONNX model checksum mismatch")
        manifest["artifacts"].append({"file":local,"url":url,"sha256":digest})
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


def samples():
    directory = ROOT / "data" / "evaluation"
    directory.mkdir(parents=True, exist_ok=True)
    repository = "spMohanty/PlantVillage-Dataset"
    revision = json.loads(get(f"https://api.github.com/repos/{repository}/commits/master"))["sha"]
    targets = {"Tomato___healthy":"Healthy Tomato Plant", "Tomato___Late_blight":"Tomato with Late Blight",
               "Potato___Early_blight":"Potato with Early Blight", "Apple___Apple_scab":"Apple Scab"}
    manifest = {"repository":repository,"revision":revision,"purpose":"smoke evaluation, not independent accuracy estimate","samples":[]}
    for folder, truth in targets.items():
        listing = json.loads(get(f"https://api.github.com/repos/{repository}/contents/raw/color/{urllib.parse.quote(folder)}?ref={revision}"))
        images = sorted((item for item in listing if item["name"].lower().endswith((".jpg",".png",".jpeg"))), key=lambda item:item["name"])[:3]
        for index, item in enumerate(images):
            url = f"https://raw.githubusercontent.com/{repository}/{revision}/raw/color/{urllib.parse.quote(folder)}/{urllib.parse.quote(item['name'])}"
            payload = get(url)
            path = directory / f"{folder}-{index}.jpg"
            path.write_bytes(payload)
            manifest["samples"].append({"file":path.name,"expected_label":truth,"source_url":url,
                                        "sha256":hashlib.sha256(payload).hexdigest()})
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Downloaded {len(manifest['samples'])} evaluation images")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("kind", choices=["model", "samples"])
    args = parser.parse_args()
    {"model":model,"samples":samples}[args.kind]()
