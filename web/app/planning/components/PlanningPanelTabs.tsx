"use client";

import type { ReactElement, ReactNode } from "react";

export type PlanningPanelTab = "planning" | "vacations";

type Props = {
  activeTab: PlanningPanelTab;
  onTabChange: (tab: PlanningPanelTab) => void;
  children: ReactNode;
};

export function PlanningPanelTabs({ activeTab, onTabChange, children }: Props): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <div className="admin-tabs" style={{ marginBottom: 0, flexShrink: 0 }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "planning"}
          className={activeTab === "planning" ? "admin-tab active" : "admin-tab"}
          onClick={() => onTabChange("planning")}
        >
          Planning
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "vacations"}
          className={activeTab === "vacations" ? "admin-tab active" : "admin-tab"}
          onClick={() => onTabChange("vacations")}
        >
          Vacations
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
    </div>
  );
}
