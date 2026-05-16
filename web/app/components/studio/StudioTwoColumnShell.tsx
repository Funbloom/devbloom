"use client";

import type { CSSProperties, ReactNode } from "react";

const defaultShellStyle: CSSProperties = {
  position: "relative",
};

const defaultRightStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  minHeight: "min(70vh, 900px)",
  display: "flex",
  flexDirection: "column",
};

type Props = {
  left: ReactNode;
  right: ReactNode;
  shellStyle?: CSSProperties;
  rightStyle?: CSSProperties;
};

/**
 * Shared Studio two-column layout (Image Gen shell classes from globals.css).
 */
export function StudioTwoColumnShell({ left, right, shellStyle, rightStyle }: Props) {
  return (
    <main>
      <div className="imagegen-shell" style={{ ...defaultShellStyle, ...shellStyle }}>
        <div className="imagegen-left">{left}</div>
        <div className="imagegen-right" style={{ ...defaultRightStyle, ...rightStyle }}>
          {right}
        </div>
      </div>
    </main>
  );
}
