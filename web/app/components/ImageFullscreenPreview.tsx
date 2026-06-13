"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { DismissButton } from "./DismissButton";

type Props = {
  imageUrl: string;
  title: string;
  onClose: () => void;
};

export function ImageFullscreenPreview(props: Props): ReactElement {
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const updateDimensions = (image: HTMLImageElement): void => {
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setDimensions({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [props.onClose]);

  useEffect(() => {
    setDimensions(null);
    const image = imageRef.current;
    if (image?.complete) {
      updateDimensions(image);
    }
  }, [props.imageUrl]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={props.title || "Image preview"}
      className="imagegen-fullscreen-overlay"
      onClick={props.onClose}
    >
      <div className="imagegen-fullscreen-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="imagegen-fullscreen-header">
          <strong className="imagegen-fullscreen-title">{props.title || "Image preview"}</strong>
          <DismissButton onClick={props.onClose} />
        </div>
        <div className="imagegen-fullscreen-image-wrap">
          <img
            ref={imageRef}
            src={props.imageUrl}
            alt={props.title || "Image preview"}
            className="imagegen-fullscreen-image"
            onLoad={(event) => {
              updateDimensions(event.currentTarget);
            }}
          />
        </div>
        {dimensions ? (
          <div className="imagegen-fullscreen-size" aria-label="Image size in pixels">
            {dimensions.width} / {dimensions.height}
          </div>
        ) : null}
      </div>
    </div>
  );
}
