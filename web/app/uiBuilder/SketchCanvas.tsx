"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import { API_BASE } from "../imageGen/config";
import type { DrawTool } from "./penPalette";
import { penColorForTool } from "./penPalette";

export type SketchCanvasHandle = {
  clear: () => void;
  /** Full canvas bitmap as PNG (device pixels). */
  getPngBlob: () => Promise<Blob | null>;
  /** Draw an image (scaled to fit, letterboxed) after layout; used when resuming a saved sketch. */
  loadFromUrl: (url: string) => Promise<boolean>;
};

type Props = {
  brushSize: number;
  /** Eraser or a labeled UI pen task (color from palette). */
  tool: DrawTool;
  className?: string;
  /** Canvas background (used for clear and initial fill) */
  backgroundColor?: string;
};

const DEFAULT_BG = "#0f1115";

function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "").trim();
  if (m.length !== 6 || !/^[0-9a-fA-F]+$/.test(m)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `#${m}${a.toString(16).padStart(2, "0")}`;
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { brushSize, tool, className, backgroundColor = DEFAULT_BG },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  const [brushPreview, setBrushPreview] = useState<{ x: number; y: number } | null>(null);

  const applyCanvasSize = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const w = Math.max(1, Math.floor(container.clientWidth));
    const h = Math.max(1, Math.floor(container.clientHeight));
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hadSize = canvas.width > 0 && canvas.height > 0;
    const snapshot = document.createElement("canvas");
    if (hadSize) {
      snapshot.width = canvas.width;
      snapshot.height = canvas.height;
      const sctx = snapshot.getContext("2d");
      if (sctx) sctx.drawImage(canvas, 0, 0);
    }

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (hadSize && snapshot.width > 0) {
      ctx.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, w, h);
    } else {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, w, h);
    }
  }, [backgroundColor]);

  useImperativeHandle(
    ref,
    () => ({
      clear: () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
      },
      getPngBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            resolve(null);
            return;
          }
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
      loadFromUrl: (url: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return Promise.resolve(false);
        const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          const paint = (attempt: number) => {
            const c = canvasRef.current;
            const ctx = c?.getContext("2d");
            if (!c || !ctx) {
              resolve(false);
              return;
            }
            const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
            const lw = c.width / dpr;
            const lh = c.height / dpr;
            if ((lw < 2 || lh < 2) && attempt < 40) {
              requestAnimationFrame(() => paint(attempt + 1));
              return;
            }
            if (lw < 1 || lh < 1) {
              resolve(false);
              return;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, lw, lh);
            const ir = img.width / img.height;
            const cr = lw / lh;
            let dw: number;
            let dh: number;
            let ox: number;
            let oy: number;
            if (ir > cr) {
              dw = lw;
              dh = lw / ir;
              ox = 0;
              oy = (lh - dh) / 2;
            } else {
              dh = lh;
              dw = lh * ir;
              ox = (lw - dw) / 2;
              oy = 0;
            }
            ctx.drawImage(img, ox, oy, dw, dh);
            resolve(true);
          };
          img.onload = () => requestAnimationFrame(() => paint(0));
          img.onerror = () => resolve(false);
          img.src = fullUrl;
        });
      },
    }),
    [backgroundColor],
  );

  useEffect(() => {
    applyCanvasSize();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => applyCanvasSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyCanvasSize]);

  useEffect(() => {
    const onWin = () => applyCanvasSize();
    window.addEventListener("resize", onWin);
    return () => window.removeEventListener("resize", onWin);
  }, [applyCanvasSize]);

  const updateBrushPreviewFromEvent = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBrushPreview({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;
    return {
      x: ((e.clientX - rect.left) / rect.width) * logicalW,
      y: ((e.clientY - rect.top) / rect.height) * logicalH,
    };
  };

  const applyStrokeStyle = (ctx: CanvasRenderingContext2D) => {
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (tool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = penColorForTool(tool) ?? "#cbd5e1";
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    updateBrushPreviewFromEvent(e);
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = getPos(e);
    lastRef.current = p;
    applyStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    updateBrushPreviewFromEvent(e);
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    const p = getPos(e);
    applyStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (canvas && e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drawingRef.current = false;
  };

  const penHex = tool !== "eraser" ? penColorForTool(tool) ?? "#cbd5e1" : null;
  const d = Math.max(1, brushSize);

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerEnter={updateBrushPreviewFromEvent}
      onPointerLeave={() => setBrushPreview(null)}
      style={{
        position: "relative",
        width: "100%",
        height: "min(60vh, 640px)",
        minHeight: "min(60vh, 640px)",
        flex: 1,
        minWidth: 0,
        borderRadius: 8,
        overflow: "hidden",
        border: "1px solid #2a2f3a",
        background: backgroundColor,
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          cursor: "none",
        }}
      />
      {brushPreview && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: brushPreview.x,
            top: brushPreview.y,
            width: d,
            height: d,
            marginLeft: -d / 2,
            marginTop: -d / 2,
            borderRadius: "50%",
            pointerEvents: "none",
            boxSizing: "border-box",
            ...(tool === "eraser"
              ? {
                  border: "2px dashed rgba(255, 255, 255, 0.55)",
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                }
              : {
                  border: `2px solid ${penHex}`,
                  backgroundColor: penHex ? hexWithAlpha(penHex, 0.14) : "transparent",
                }),
          }}
        />
      )}
    </div>
  );
});
