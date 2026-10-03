import io
import uuid
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError

from .association import associate
from .contracts import ImageAsset, Observation
from .errors import ServiceError
from .storage import utc_now


def import_image(store, settings, contents: bytes, metadata):
    store.require_zone(metadata.zone_id)
    if len(contents) > settings.max_upload_bytes:
        raise ServiceError(413, "UPLOAD_TOO_LARGE", "Image exceeds configured upload limit")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as original:
                if original.format not in {"JPEG", "PNG"}:
                    raise ServiceError(400, "INVALID_IMAGE", "Only JPEG and PNG images are supported")
                if original.width * original.height > settings.max_image_pixels:
                    raise ServiceError(413, "IMAGE_TOO_LARGE", "Decoded image exceeds pixel limit")
                # Save a lossless orientation-normalized evidence image. Original bytes retained separately.
                original.load()
                image = ImageOps.exif_transpose(original).convert("RGB")
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ServiceError(413, "IMAGE_TOO_LARGE", "Decoded image exceeds safety limit") from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise ServiceError(400, "INVALID_IMAGE", "Image cannot be decoded") from None
    observation_id, asset_id = str(uuid.uuid4()), str(uuid.uuid4())
    directory = store.directory / "assets"
    directory.mkdir(exist_ok=True)
    path = directory / f"{asset_id}.png"
    original_path = directory / f"{asset_id}.original"
    image.save(path, "PNG")
    original_path.write_bytes(contents)
    observation = Observation(**metadata.model_dump(), id=observation_id, received_at=utc_now(),
        image=ImageAsset(url=f"/api/assets/{asset_id}", width=image.width, height=image.height),
        association=associate(metadata, settings.telemetry_tolerance_ms))
    try:
        store.save_observation(observation, asset_id, path, "image/png")
    except Exception:
        path.unlink(missing_ok=True)
        original_path.unlink(missing_ok=True)
        raise
    return observation
