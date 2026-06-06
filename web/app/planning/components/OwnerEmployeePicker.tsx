"use client";

import { useMemo } from "react";
import type { CSSProperties, ReactElement } from "react";
import { joinOwnersOrdered, resolveOwnersToEmployees, splitOwners } from "../milestoneDetail";
import type { PlanningEmployee } from "../types";

type Props = {
  employees: PlanningEmployee[];
  value: string;
  disabled?: boolean;
  onChange: (owner: string) => void;
};

const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "3px 8px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  maxWidth: 140,
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const selectedPill: CSSProperties = {
  ...pillBase,
  background: "rgba(59,130,246,0.22)",
  color: "#93c5fd",
  border: "1px solid rgba(59,130,246,0.45)",
};

const unknownPill: CSSProperties = {
  ...pillBase,
  background: "rgba(234,179,8,0.18)",
  color: "#fde047",
  border: "1px solid rgba(234,179,8,0.4)",
};

const selectStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #334155",
  background: "#0f172a",
  color: "#f1f5f9",
  width: "100%",
  fontSize: 13,
  boxSizing: "border-box",
  cursor: "pointer",
};

export function OwnerEmployeePicker({
  employees,
  value,
  disabled,
  onChange,
}: Props): ReactElement {
  const sortedEmployees = useMemo(
    () => [...employees].sort((left, right) => left.order_index - right.order_index),
    [employees],
  );

  const employeeNamesLower = useMemo(
    () => new Set(sortedEmployees.map((employee) => employee.name.toLowerCase())),
    [sortedEmployees],
  );

  const selectedOwners = useMemo(
    () => resolveOwnersToEmployees(value, sortedEmployees),
    [value, sortedEmployees],
  );

  const availableEmployees = useMemo(
    () =>
      sortedEmployees.filter(
        (employee) => !selectedOwners.some((name) => name.toLowerCase() === employee.name.toLowerCase()),
      ),
    [sortedEmployees, selectedOwners],
  );

  const handleAdd = (name: string) => {
    if (!name) {
      return;
    }
    const next = joinOwnersOrdered([...selectedOwners, name], sortedEmployees);
    onChange(next);
  };

  const handleRemove = (name: string) => {
    const next = selectedOwners.filter((owner) => owner !== name);
    onChange(joinOwnersOrdered(next, sortedEmployees));
  };

  if (sortedEmployees.length === 0) {
    return (
      <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)", lineHeight: 1.4 }}>
        No employees in database. Add them in Admin.
      </span>
    );
  }

  return (
    <div style={{ display: "grid", gap: 6, minWidth: 160 }}>
      {selectedOwners.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {selectedOwners.map((name) => {
            const isKnown = employeeNamesLower.has(name.toLowerCase());
            return (
              <span
                key={name}
                style={isKnown ? selectedPill : unknownPill}
                title={isKnown ? name : `${name} (not in employee database)`}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => handleRemove(name)}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      lineHeight: 1,
                      fontSize: 14,
                    }}
                    aria-label={`Remove ${name}`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : (
        <span style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>No owner</span>
      )}
      <select
        value=""
        disabled={disabled || availableEmployees.length === 0}
        style={selectStyle}
        onChange={(event) => {
          handleAdd(event.target.value);
          event.target.value = "";
        }}
      >
        <option value="">
          {availableEmployees.length === 0 ? "All employees assigned" : "Add owner…"}
        </option>
        {availableEmployees.map((employee) => (
          <option key={employee.id} value={employee.name}>
            {employee.name}
            {employee.title.trim() ? ` — ${employee.title.trim()}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OwnerEmployeePills({
  owners,
  employees,
}: {
  owners: string[];
  employees: PlanningEmployee[];
}): ReactElement {
  if (owners.length === 0) {
    return <>—</>;
  }

  const employeeNamesLower = new Set(employees.map((employee) => employee.name.toLowerCase()));

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {owners.map((name, index) => {
        const isKnown = employeeNamesLower.has(name.toLowerCase());
        return (
          <span
            key={`${name}-${index}`}
            style={isKnown ? selectedPill : unknownPill}
            title={isKnown ? name : `${name} (not in employee database)`}
          >
            {name}
          </span>
        );
      })}
    </div>
  );
}
