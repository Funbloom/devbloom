"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

export type SketchTool = "pen" | "eraser";

export type SketchCanvasHandle = {
  clear: () => void;
  /** Full canvas bitmap as PNG (device pixels). */
  getPngBlob: () => Promise<Blob | null>;
};

type Props = {
  brushSize: number;
  tool: SketchTool;
  className?: string;
  /** CSS color for pen ink */
  penColor?: string;
  /** Canvas background (used for clear and initial fill) */
  backgroundColor?: string;
};

const DEFAULT_BG = "#0f1115";
const DEFAULT_PEN = "#cbd5e1";

export const SketchCanvas = forwardRef<SketchCanvasHandle, Props>(function SketchCanvas(
  { brushSize, tool, className, penColor = DEFAULT_PEN, backgroundColor = DEFAULT_BG },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

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
      ctx.strokeStyle = penColor;
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    e.preventDefault();
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

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
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
          cursor: tool === "eraser" ? "cell" : "crosshair",
        }}
      />
    </div>
  );
});
