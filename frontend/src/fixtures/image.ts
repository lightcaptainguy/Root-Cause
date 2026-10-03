// Generates a tiny synthetic test image (PNG) and transparent mask.
// These are bundled as base64 data URLs — no external hotlinks.

// 8x8 red PNG
export const FIXTURE_IMAGE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8Dwn4EKwAiJ+BwAfx8BAYCFh2MAAAAASUVORK5CYII=';

// 8x8 transparent PNG (mask)
export const FIXTURE_MASK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76lAAAAFklEQVR4nGP8z8Dwn4EKwAiJ+BwAfx8BAYCFh2MAAAAASUVORK5CYII=';

export function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export function getFixtureImageBlob(): Blob {
  return base64ToBlob(FIXTURE_IMAGE_PNG_BASE64, 'image/png');
}

export function getFixtureMaskBlob(): Blob {
  return base64ToBlob(FIXTURE_MASK_PNG_BASE64, 'image/png');
}

export function getFixtureImageDataUrl(): string {
  return `data:image/png;base64,${FIXTURE_IMAGE_PNG_BASE64}`;
}

export function getFixtureMaskDataUrl(): string {
  return `data:image/png;base64,${FIXTURE_MASK_PNG_BASE64}`;
}
