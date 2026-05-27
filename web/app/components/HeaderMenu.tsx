"use client";

import type { ReactNode } from "react";

type Props = {
  label: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
  wide?: boolean;
};

export function HeaderMenu({ label, children, summaryClassName = "", wide }: Props) {
  return (
    <details className="app-header-menu">
      <summary className={`app-header-menu-summary app-header-link ${summaryClassName}`.trim()}>{label}</summary>
      <div className={`app-header-dropdown${wide ? " app-header-dropdown--wide" : ""}`}>{children}</div>
    </details>
  );
}
