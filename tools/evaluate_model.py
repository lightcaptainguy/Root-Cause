"""Small smoke evaluation; never interpreted as a generalization benchmark."""

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.config import PROJECT_ROOT, Settings
from backend.vision import Vision

directory = PROJECT_ROOT / "data" / "evaluation"
manifest = json.loads((directory / "manifest.json").read_text())
vision = Vision(Settings())
if not vision.ready:
    raise SystemExit(vision.error)
rows = []
for sample in manifest["samples"]:
    started = time.perf_counter()
    prediction, _ = vision.classify(directory / sample["file"], "closeup_leaf")
    rows.append({"file":sample["file"],"expected":sample["expected_label"],"predicted":prediction.label,
                 "score":prediction.score,"matched":prediction.label == sample["expected_label"],
                 "elapsed_ms":(time.perf_counter()-started)*1000})
report = {"warning":"Small dataset smoke test; images may overlap original training data. Not held-out field accuracy.",
          "provider":vision.session.get_providers(),"count":len(rows),"matched":sum(row["matched"] for row in rows),"rows":rows}
output = PROJECT_ROOT / "docs" / "verification" / "model-smoke.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report, indent=2))
