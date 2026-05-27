"use client";

import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import type { MissionSummary } from "../narrativeClient";
import type { NarrativeSidebarTab } from "../narrativeSession";

type Props = {
  missions: MissionSummary[];
  activeMissionId: string;
  sidebarTab: NarrativeSidebarTab;
  onSidebarTabChange: (tab: NarrativeSidebarTab) => void;
  onSelectMission: (id: string) => void;
  onAddMission: () => void;
};

export function MissionList({
  missions,
  activeMissionId,
  sidebarTab,
  onSidebarTabChange,
  onSelectMission,
  onAddMission,
}: Props): ReactElement {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) {
      return missions;
    }
    return missions.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
    );
  }, [missions, filter]);

  return (
    <aside className="narrative-sidebar imagegen-panel">
      <div className="narrative-sidebar-header imagegen-panel-title">
        <span>Missions</span>
        <span className="narrative-badge">{missions.length}</span>
      </div>
      <div className="narrative-sidebar-body imagegen-panel-body">
        <div className="narrative-sidebar-tabs" role="tablist" aria-label="Mission panel mode">
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "dialogues"}
            className={`narrative-sidebar-tab${sidebarTab === "dialogues" ? " narrative-sidebar-tab--active" : ""}`}
            onClick={() => onSidebarTabChange("dialogues")}
          >
            Dialogues
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === "mission"}
            className={`narrative-sidebar-tab${sidebarTab === "mission" ? " narrative-sidebar-tab--active" : ""}`}
            onClick={() => onSidebarTabChange("mission")}
          >
            Mission
          </button>
        </div>
        {sidebarTab === "mission" ? (
          <button
            type="button"
            className="imagegen-generate-button narrative-add-mission-btn"
            onClick={onAddMission}
          >
            Add Mission
          </button>
        ) : null}
        <label className="narrative-search-field">
          <span className="sr-only">Filter missions</span>
          <input
            type="search"
            className="narrative-search-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search missions…"
          />
        </label>
        <ul className="narrative-mission-list" role="listbox" aria-label="Mission list">
          {filtered.length === 0 ? (
            <li className="narrative-mission-empty">No missions match your search.</li>
          ) : (
            filtered.map((mission) => {
              const active = mission.id === activeMissionId;
              return (
                <li key={mission.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`narrative-mission-item${active ? " narrative-mission-item--active" : ""}`}
                    onClick={() => onSelectMission(mission.id)}
                  >
                    <span className="narrative-mission-item-title">{mission.title || mission.id}</span>
                    <span className="narrative-mission-item-id">{mission.id}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </aside>
  );
}
