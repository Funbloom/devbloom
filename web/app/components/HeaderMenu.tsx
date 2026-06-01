"use client";

import type { MouseEvent, ReactNode } from "react";

type Props = {
  label: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
  wide?: boolean;
};

export function closeAllHeaderMenus() {
  if (typeof document === "undefined") {
    return;
  }
  document
    .querySelectorAll("header.app-header details.app-header-menu, header.app-header details.app-header-submenu")
    .forEach((node) => {
      (node as HTMLDetailsElement).open = false;
    });
}

function closeParentHeaderMenu(from: Element) {
  const submenu = from.closest("details.app-header-submenu");
  if (submenu) {
    (submenu as HTMLDetailsElement).open = false;
  }
  const menu = from.closest("details.app-header-menu");
  if (menu) {
    (menu as HTMLDetailsElement).open = false;
  }
}

export function HeaderMenu({ label, children, summaryClassName = "", wide }: Props) {
  const onDropdownClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target;
    if (!(target instanceof Element)) {
      return;
    }
    const projectPicker = target.closest("button.app-header-dropdown-action");
    if (projectPicker?.closest("details.app-header-submenu")) {
      closeParentHeaderMenu(projectPicker);
      return;
    }
    if (target.closest("details.app-header-submenu")) {
      return;
    }
    const actionable = target.closest(
      "a.app-header-dropdown-link, button.app-header-dropdown-link, button.app-header-dropdown-action",
    );
    if (actionable) {
      closeParentHeaderMenu(actionable);
    }
  };

  return (
    <details className="app-header-menu">
      <summary className={`app-header-menu-summary app-header-link ${summaryClassName}`.trim()}>{label}</summary>
      <div
        className={`app-header-dropdown${wide ? " app-header-dropdown--wide" : ""}`}
        onClick={onDropdownClick}
      >
        {children}
      </div>
    </details>
  );
}
