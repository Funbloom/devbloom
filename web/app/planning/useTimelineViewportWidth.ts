"use client";

import { useEffect, useRef, useState } from "react";

export function useTimelineViewportWidth(): {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  viewportWidth: number;
} {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    const update = () => {
      setViewportWidth(element.clientWidth);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { scrollRef, viewportWidth };
}
