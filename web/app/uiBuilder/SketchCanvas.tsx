"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { fetchApi } from "../lib/api";
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
  /** Draw surface orientation. */
  orientation?: "landscape" | "portrait";
  /** Called when the user draws, pastes, or places text/labels (not on resize-only). */
  onContentModified?: () => void;
};

const DEFAULT_BG = "#0f1115";

function hexWithAlpha(hex: string, alpha: number): string {
  const m = hex.replace("#", "").trim();
  if (m.length !== 6 || !/^[0-9a-fA-F]+$/.test(m)) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `#${m}${a.toString(16).padStart(2, "0")}`;
}

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { brushSize, tool, className, backgroundColor = DEFAULT_BG, orientation = "landscape", onContentModified },
  ref,
) {
  const aspectRatio = orientation === "portrait" ? "9 / 16" : "16 / 9";
  const frameHeight = orientation === "portrait" ? "min(100%, calc(100vh - 250px))" : "100%";
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });
  /** Label tool: snapshot at drag start + rect anchor (logical px). */
  const labelDragRef = useRef<{
    start: { x: number; y: number };
    backup: ImageData;
  } | null>(null);
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

  const applyCanvasSizeRef = useRef(applyCanvasSize);
  applyCanvasSizeRef.current = applyCanvasSize;

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
        const isBlobUrl = url.startsWith("blob:");
        const fullUrl =
          url.startsWith("http") || isBlobUrl
            ? url
            : `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
        return (async (): Promise<boolean> => {
          let bitmap: ImageBitmap | null = null;
          try {
            const res = isBlobUrl
              ? await fetch(fullUrl, { cache: "no-store" })
              : await fetchApi(fullUrl, { cache: "no-store" });
            if (!res.ok) return false;
            const blob = await res.blob();
            bitmap = await createImageBitmap(blob);
          } catch {
            return false;
          }
          const iw = bitmap.width;
          const ih = bitmap.height;
          return new Promise<boolean>((resolve) => {
            const paint = (attempt: number) => {
              applyCanvasSizeRef.current();
              const c = canvasRef.current;
              const ctx = c?.getContext("2d");
              const b = bitmap;
              if (!c || !ctx || !b) {
                bitmap?.close();
                resolve(false);
                return;
              }
              const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
              const lw = c.width / dpr;
              const lh = c.height / dpr;
              const container = containerRef.current;
              const cw = container?.clientWidth ?? 0;
              const ch = container?.clientHeight ?? 0;
              if (lw < 4 || lh < 4 || cw < 4 || ch < 4) {
                if (attempt < 80) {
                  requestAnimationFrame(() => paint(attempt + 1));
                  return;
                }
                b.close();
                resolve(false);
                return;
              }
              if (lw < 1 || lh < 1) {
                b.close();
                resolve(false);
                return;
              }
              ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
              ctx.fillStyle = backgroundColor;
              ctx.fillRect(0, 0, lw, lh);
              const ir = iw / ih;
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
              ctx.drawImage(b, ox, oy, dw, dh);
              b.close();
              resolve(true);
            };
            requestAnimationFrame(() => paint(0));
          });
        })();
      },
    }),
    [backgroundColor],
  );

  /** Run before paint so the canvas has real dimensions before the parent’s useEffect calls loadFromUrl. */
  useLayoutEffect(() => {
    applyCanvasSize();
  }, [applyCanvasSize]);

  useEffect(() => {
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

  /** Composite a pasted image on top of the sketch (centered, ~92% max size). Caller must not close bitmap before this runs. */
  const compositePastedImageBitmap = useCallback(
    (bitmap: ImageBitmap) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        bitmap.close();
        return;
      }
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const lw = canvas.width / dpr;
      const lh = canvas.height / dpr;
      if (lw < 2 || lh < 2) {
        bitmap.close();
        return;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const iw = bitmap.width;
      const ih = bitmap.height;
      const maxW = lw * 0.92;
      const maxH = lh * 0.92;
      let dw = maxW;
      let dh = (ih / iw) * maxW;
      if (dh > maxH) {
        dh = maxH;
        dw = (iw / ih) * maxH;
      }
      const ox = (lw - dw) / 2;
      const oy = (lh - dh) / 2;
      ctx.drawImage(bitmap, ox, oy, dw, dh);
      bitmap.close();
      onContentModified?.();
    },
    [onContentModified],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const cd = e.clipboardData;
      if (!cd) return;

      const runImageBlob = (blob: Blob | null) => {
        if (!blob || !blob.type.startsWith("image/")) return;
        e.preventDefault();
        void (async () => {
          let bitmap: ImageBitmap | null = null;
          try {
            bitmap = await createImageBitmap(blob);
          } catch {
            return;
          }
          compositePastedImageBitmap(bitmap);
        })();
      };

      for (let i = 0; i < cd.items.length; i++) {
        const item = cd.items[i];
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            runImageBlob(blob);
            return;
          }
        }
      }
      if (cd.files?.length) {
        const f = cd.files[0];
        if (f.type.startsWith("image/")) runImageBlob(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [compositePastedImageBitmap]);

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

  const strokeLabelRect = (
    ctx: CanvasRenderingContext2D,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ) => {
    const x = Math.min(ax, bx);
    const y = Math.min(ay, by);
    const w = Math.abs(bx - ax);
    const h = Math.abs(by - ay);
    if (w < 1 && h < 1) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = penColorForTool("label") ?? "#d06767";
    ctx.lineWidth = Math.max(1, brushSize);
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, Math.max(w, 1), Math.max(h, 1));
    ctx.restore();
  };

  const drawPlacedText = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string) => {
    const fontPx = Math.max(12, Math.min(36, Math.round(brushSize * 1.35)));
    const lines = text.split(/\r?\n/);
    if (lines.every((ln) => !ln.trim())) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    const lh = fontPx * 1.3;
    const outlineW = Math.max(2, fontPx / 14);
    lines.forEach((line, i) => {
      const ly = y + i * lh;
      if (!line.trim()) return;
      ctx.strokeStyle = "rgba(15,17,21,0.88)";
      ctx.lineWidth = outlineW;
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.strokeText(line, x, ly);
      ctx.fillStyle = "#f1f5f9";
      ctx.fillText(line, x, ly);
    });
    ctx.restore();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
    updateBrushPreviewFromEvent(e);

    if (tool === "text") {
      const p = getPos(e);
      const raw = window.prompt("Text to place on the sketch (shown as literal copy in the polish):", "");
      if (raw == null) return;
      const trimmed = raw.trim();
      if (!trimmed) return;
      drawPlacedText(ctx, p.x, p.y, trimmed);
      onContentModified?.();
      return;
    }

    if (tool === "label") {
      canvas.setPointerCapture(e.pointerId);
      const p = getPos(e);
      lastRef.current = p;
      try {
        labelDragRef.current = {
          start: p,
          backup: ctx.getImageData(0, 0, canvas.width, canvas.height),
        };
      } catch {
        labelDragRef.current = null;
        return;
      }
      drawingRef.current = true;
      return;
    }

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

    if (tool === "label" && labelDragRef.current) {
      const { backup, start } = labelDragRef.current;
      ctx.putImageData(backup, 0, 0);
      const p = getPos(e);
      lastRef.current = p;
      strokeLabelRect(ctx, start.x, start.y, p.x, p.y);
      return;
    }

    const p = getPos(e);
    applyStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    if (tool === "label" && drawingRef.current && labelDragRef.current) {
      e.preventDefault();
      const { backup, start } = labelDragRef.current;
      ctx.putImageData(backup, 0, 0);
      const p = getPos(e);
      strokeLabelRect(ctx, start.x, start.y, p.x, p.y);
      labelDragRef.current = null;
      drawingRef.current = false;
      if (e.pointerId) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      onContentModified?.();
      return;
    }

    if (!drawingRef.current) return;
    if (canvas && e.pointerId) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    drawingRef.current = false;
    onContentModified?.();
  };

  const penHex = tool !== "eraser" ? penColorForTool(tool) ?? "#cbd5e1" : null;
  const d = Math.max(1, brushSize);
  const canvasCursor = tool === "text" ? "text" : tool === "label" ? "crosshair" : "none";

  return (
    <div
      ref={containerRef}
      className={className}
      onPointerEnter={updateBrushPreviewFromEvent}
      onPointerLeave={() => setBrushPreview(null)}
      style={{
        position: "relative",
        width: "auto",
        maxWidth: "100%",
        height: frameHeight,
        maxHeight: frameHeight,
        minHeight: 0,
        aspectRatio,
        flex: 1,
        minWidth: 0,
        alignSelf: "center",
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
          cursor: canvasCursor,
        }}
      />
      {brushPreview && tool !== "text" && (
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
            borderRadius: tool === "label" ? 4 : "50%",
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
