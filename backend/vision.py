"""Local ONNX leaf classifier; no network access during inference."""

import json
from pathlib import Path

import numpy as np
from PIL import Image

from .contracts import Classification


class Vision:
    def __init__(self, settings):
        self.directory = settings.vision_config_dir
        self.path = settings.vision_model_path or self.directory / "model.onnx"
        self.session = None
        self.error = "No local classifier configured"
        if not self.path.is_file():
            return
        try:
            import onnxruntime as ort
            self.config = json.loads((self.directory / "config.json").read_text())
            self.preprocessor = json.loads((self.directory / "preprocessor_config.json").read_text())
            options = ort.SessionOptions()
            options.intra_op_num_threads = 4
            # Small MobileNet CPU inference leaves GPU memory available for Ollama.
            self.session = ort.InferenceSession(str(self.path), sess_options=options, providers=["CPUExecutionProvider"])
            self.input = self.session.get_inputs()[0]
            self.labels = self.config["id2label"]
            self.error = None
        except Exception as exc:
            self.error = f"Local model could not be loaded: {type(exc).__name__}: {exc}"

    @property
    def ready(self):
        return self.session is not None

    def preprocess(self, image):
        p = self.preprocessor
        image = image.convert("RGB")
        if p.get("do_resize", True):
            size = p.get("size", {"shortest_edge": 256})
            if "shortest_edge" in size:
                ratio = size["shortest_edge"] / min(image.size)
                dimensions = tuple(int(side * ratio) for side in image.size)
            else:
                dimensions = (size["width"], size["height"])
            image = image.resize(dimensions, resample=int(p.get("resample", 2)))
        if p.get("do_center_crop", False):
            size = p["crop_size"]
            width, height = size["width"], size["height"]
            left, top = (image.width - width) // 2, (image.height - height) // 2
            image = image.crop((left, top, left + width, top + height))
        values = np.asarray(image, dtype=np.float32)
        if p.get("do_rescale", True):
            values *= p.get("rescale_factor", 1 / 255)
        if p.get("do_normalize", True):
            values = (values - np.asarray(p["image_mean"], dtype=np.float32)) / np.asarray(p["image_std"], dtype=np.float32)
        return np.ascontiguousarray(values.transpose(2, 0, 1)[None], dtype=np.float32)

    def classify(self, image_path: Path, image_kind):
        if image_kind != "closeup_leaf":
            return Classification(status="unsupported"), ["The configured leaf classifier does not support aerial/other images"]
        if not self.ready:
            return Classification(), [self.error]
        with Image.open(image_path) as image:
            tensor = self.preprocess(image)
        logits = self.session.run(None, {self.input.name: tensor})[0][0].astype(np.float64)
        if logits.shape != (len(self.labels),) or not np.isfinite(logits).all():
            raise ValueError("Model output does not match finite label logits")
        scores = np.exp(logits - logits.max())
        scores /= scores.sum()
        index = int(scores.argmax())
        label = self.labels[str(index)]
        # Keep canonical label unchanged; crop is derived only when encoded by label vocabulary.
        crops = (["Apple"]*4 + ["Blueberry"] + ["Cherry"]*2 + ["Corn"]*4 + ["Grape"]*4 +
                 ["Orange"] + ["Peach"]*2 + ["Bell Pepper"]*2 + ["Potato"]*3 + ["Raspberry", "Soybean", "Squash"] +
                 ["Strawberry"]*2 + ["Tomato"]*10)
        crop = crops[index] if len(self.labels) == 38 else None
        return Classification(status="available", crop=crop, label=label, score=float(scores[index]),
                              model_id="plantvillage-mobilenet-v2-95110a1"), [
            "Image-level leaf classification; score is not calibrated diagnostic confidence",
            "No validated lesion segmentation or aerial disease analysis is configured",
        ]
