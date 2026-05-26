import { useState, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url: string;
  onClose: () => void;
}

export function ImageLightbox({ url, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const lastTapRef = useRef(0);
  const pinchRef = useRef({ dist: 0, scale: 1 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function reset() { setScale(1); setOffset({ x: 0, y: 0 }); }

  function clampOffset(ox: number, oy: number, s: number) {
    // Allow panning but keep image partially visible
    const maxX = Math.max(0, (window.innerWidth * (s - 1)) / 2);
    const maxY = Math.max(0, (window.innerHeight * (s - 1)) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }

  // ── Mouse drag ──────────────────────────────────────────────────────────────
  function handleMouseDown(e: React.MouseEvent) {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return;
    const ox = dragStart.current.ox + e.clientX - dragStart.current.x;
    const oy = dragStart.current.oy + e.clientY - dragStart.current.y;
    setOffset(clampOffset(ox, oy, scale));
  }
  function handleMouseUp() { setDragging(false); }

  // ── Scroll wheel zoom ───────────────────────────────────────────────────────
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setScale((s) => {
      const next = Math.min(6, Math.max(0.5, s * factor));
      if (next <= 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }

  // ── Double-tap / double-click to toggle zoom ────────────────────────────────
  function handleInteraction(e: React.MouseEvent | React.TouchEvent) {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      if (scale > 1) { reset(); } else { setScale(2.5); }
      e.preventDefault();
    } else {
      lastTapRef.current = now;
    }
  }

  // ── Touch: pinch-to-zoom + single-finger pan ────────────────────────────────
  function getTouchDist(e: React.TouchEvent) {
    const t1 = e.touches[0], t2 = e.touches[1];
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: getTouchDist(e), scale };
    } else if (e.touches.length === 1) {
      dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, ox: offset.x, oy: offset.y };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const newDist = getTouchDist(e);
      const ratio = newDist / pinchRef.current.dist;
      const next = Math.min(6, Math.max(0.5, pinchRef.current.scale * ratio));
      setScale(next);
      if (next <= 1) setOffset({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && scale > 1) {
      e.preventDefault();
      const ox = dragStart.current.ox + e.touches[0].clientX - dragStart.current.x;
      const oy = dragStart.current.oy + e.touches[0].clientY - dragStart.current.y;
      setOffset(clampOffset(ox, oy, scale));
    }
  }

  const imgStyle: React.CSSProperties = {
    transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
    transformOrigin: "center",
    transition: dragging ? "none" : "transform 0.12s ease",
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    userSelect: "none",
    WebkitUserSelect: "none",
    touchAction: "none",
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/96 flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <button
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors"
            onClick={() => setScale((s) => Math.max(0.5, s / 1.4))}
          >
            <ZoomOut className="h-4 w-4 text-white" />
          </button>
          <span className="text-xs text-white/50 w-12 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors"
            onClick={() => setScale((s) => Math.min(6, s * 1.4))}
          >
            <ZoomIn className="h-4 w-4 text-white" />
          </button>
          {(scale !== 1 || offset.x !== 0 || offset.y !== 0) && (
            <button
              className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors"
              onClick={reset}
            >
              <RotateCcw className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>
        <button
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 active:bg-white/30 transition-colors"
          onClick={onClose}
        >
          <X className="h-5 w-5 text-white" />
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden"
        style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onClick={(e) => { if (e.target === containerRef.current) onClose(); }}
        onDoubleClick={handleInteraction}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <img
          src={url}
          alt="Scanned invoice"
          draggable={false}
          style={imgStyle}
          onDoubleClick={handleInteraction}
        />
      </div>

      {/* Hint bar */}
      <div className="flex items-center justify-center py-3 shrink-0">
        <p className="text-[10px] text-white/25 text-center">
          {scale > 1
            ? "Drag to pan  ·  Pinch or scroll to zoom  ·  Double-tap to reset"
            : "Pinch or scroll to zoom  ·  Double-tap to zoom in"}
        </p>
      </div>
    </div>
  );
}
