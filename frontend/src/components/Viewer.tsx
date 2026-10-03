import { useEffect, useRef, useState } from "react";
import type { Observation } from "../types";

export function Viewer({ observation }: { observation: Observation }) {
  const [showBox, setShowBox] = useState(true);
  const [showMask, setShowMask] = useState(true);
  const [fitPanel, setFitPanel] = useState(true);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const geometry = observation.geometry;
  const dims = geometry
    ? { w: geometry.width, h: geometry.height }
    : natural;

  const boxAvailable = !!geometry?.box;
  const maskAvailable = !!geometry?.maskUrl;

  useEffect(() => {
    setShowBox(true);
    setShowMask(true);
    setNatural(null);
  }, [observation.id]);

  return (
    <section className="viewer" aria-label="Image viewer">
      <div className="viewer-controls">
        <button aria-pressed={showBox} disabled={!boxAvailable} onClick={() => setShowBox((v) => !v)}>
          Leaf box
        </button>
        <button aria-pressed={showMask} disabled={!maskAvailable} onClick={() => setShowMask((v) => !v)}>
          Discoloration overlay
        </button>
        <button onClick={() => setFitPanel((v) => !v)} aria-pressed={fitPanel}>
          {fitPanel ? "Fit: panel" : "Fit: natural"}
        </button>
      </div>
      <p className="viewer-methods">
        <span>Leaf box method: {geometry?.boxMethod ?? "unavailable"}{boxAvailable ? "" : " (no box provided)"}</span>
        <br />
        <span>Overlay method: {geometry?.maskMethod ?? "Segmentation unavailable"}</span>
      </p>

      <div className="image-frame">
        <div className="image-wrap" style={fitPanel ? { maxHeight: "55vh" } : undefined}>
          <img
            ref={imgRef}
            src={observation.imageUrl}
            alt={`Crop image ${observation.id}, kind ${observation.imageKind}`}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={fitPanel ? { maxHeight: "55vh", width: "auto" } : undefined}
          />
          {dims && (
            <svg
              className="overlay"
              viewBox={`0 0 ${dims.w} ${dims.h}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {showMask && maskAvailable && (
                <image href={geometry!.maskUrl} x={0} y={0} width={dims.w} height={dims.h} preserveAspectRatio="none" />
              )}
              {showBox && boxAvailable && geometry?.box && (
                <rect
                  x={geometry.box.x}
                  y={geometry.box.y}
                  width={geometry.box.width}
                  height={geometry.box.height}
                  fill="none"
                  stroke="#2f6b46"
                  strokeWidth={Math.max(2, dims.w / 300)}
                />
              )}
            </svg>
          )}
        </div>
      </div>
      <p className="viewer-meta">
        Dimensions: {dims ? `${dims.w} × ${dims.h} px` : "loading…"} · Source: {observation.source} · Kind: {observation.imageKind}
      </p>
    </section>
  );
}
