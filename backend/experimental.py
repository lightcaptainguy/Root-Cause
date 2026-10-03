"""Opt-in color heuristics. These are NOT validated leaf/lesion models."""

from collections import deque
import uuid

import numpy as np
from PIL import Image

from .contracts import Box, Localization, Segmentation


def largest_component(mask):
    height, width = mask.shape
    seen = np.zeros_like(mask)
    best = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y,x]:
            continue
        queue = deque([(int(y),int(x))]); seen[y,x] = True; component = []
        while queue:
            cy,cx = queue.popleft(); component.append((cy,cx))
            for ny,nx in ((cy-1,cx),(cy+1,cx),(cy,cx-1),(cy,cx+1)):
                if 0 <= ny < height and 0 <= nx < width and mask[ny,nx] and not seen[ny,nx]:
                    seen[ny,nx] = True; queue.append((ny,nx))
        if len(component) > len(best):
            best = component
    output = np.zeros_like(mask)
    if best:
        ys,xs = zip(*best); output[ys,xs] = True
    return output


def overlays(store, observation, image_path):
    if observation.image_kind != "closeup_leaf":
        return Localization(status="unsupported"), Segmentation(status="unsupported"), []
    with Image.open(image_path) as original:
        image = original.convert("RGB")
        small = image.copy(); small.thumbnail((256,256))
        rgb = np.asarray(small, dtype=np.float32) / 255
        maximum, minimum = rgb.max(axis=2), rgb.min(axis=2)
        saturation = (maximum-minimum)/np.maximum(maximum,0.001)
        leaf = largest_component((saturation > 0.18) & (maximum > 0.15))
        limitations = ["Experimental color-based leaf/discoloration overlays; not validated disease localization or severity",
                       "Heuristic assumes a single leaf against a mostly neutral background; discoloration may have other causes"]
        if leaf.sum() < 0.03*leaf.size:
            return Localization(), Segmentation(), limitations + ["Heuristic could not identify a sufficient leaf region"]
        # Red/brown/yellow dominance is only a visual discoloration candidate, not a lesion diagnosis.
        red,green,blue = rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
        candidates = leaf & (red > green*0.95) & (red > blue*1.15)
        mask = Image.fromarray((candidates*255).astype(np.uint8)).resize(image.size, Image.Resampling.NEAREST)
        rgba = Image.new("RGBA",image.size,(239,120,25,0))
        rgba.putalpha(mask.point(lambda value: 150 if value else 0))
        asset_id = str(uuid.uuid4())
        path = store.directory / "assets" / f"{asset_id}.png"
        rgba.save(path)
        store.add_asset(asset_id,path,"image/png")
        ys,xs = np.nonzero(leaf)
        scale_x,scale_y = image.width/small.width,image.height/small.height
        box = Box(coordinates=(float(xs.min()*scale_x),float(ys.min()*scale_y),
            float((xs.max()+1)*scale_x),float((ys.max()+1)*scale_y)),label="Experimental leaf region",method="color-foreground-v1")
        return (Localization(status="available",method="experimental-color-foreground-v1",boxes=[box]),
                Segmentation(status="available",method="experimental-discoloration-v1-not-disease-segmentation",
                    mask_url=f"/api/assets/{asset_id}",affected_fraction=float(candidates.sum()/leaf.sum()),denominator="leaf_area"),limitations)
