import type { ReactNode } from "react";

export type ToolIconId =
  | "agents"
  | "imageGen"
  | "imageResize"
  | "voiceGen"
  | "audiobank"
  | "uiBuilder"
  | "meshGen"
  | "storyboard"
  | "planning"
  | "vacations"
  | "admin"
  | "installation"
  | "usage"
  | "projects";

const ICONS: Record<ToolIconId, ReactNode> = {
  agents: (
    <>
      <rect x="5" y="8" width="14" height="11" rx="2" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <path d="M9.5 16h5" />
    </>
  ),
  imageGen: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 15l-5-5-4 4-2-2-5 5" />
      <path d="M16 5l2-2M18 7l2-2" />
    </>
  ),
  imageResize: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1" />
      <path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6" />
    </>
  ),
  voiceGen: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4M8 21h8" />
    </>
  ),
  audiobank: (
    <>
      <path d="M4 6h16v12H4z" />
      <path d="M8 10v4M12 9v6M16 11v2" />
    </>
  ),
  uiBuilder: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M9 9v11" />
      <rect x="12" y="12" width="6" height="4" rx="1" />
    </>
  ),
  meshGen: (
    <>
      <path d="M12 3l8 5v8l-8 5-8-5V8z" />
      <path d="M12 3v10M4 8l8 5 8-5M12 21V13" />
    </>
  ),
  storyboard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M9 5v14" />
      <path d="M12 13l3 2-3 2z" fill="currentColor" stroke="none" />
    </>
  ),
  planning: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10M7 12h7M7 16h4" />
      <path d="M3 9h18" />
    </>
  ),
  vacations: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 2v4M17 2v4M3 9h18" />
      <path d="M8 14h2M14 14h2" />
    </>
  ),
  admin: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>
  ),
  installation: (
    <>
      <path d="M12 3v10" />
      <path d="M8 9l4 4 4-4" />
      <path d="M5 17h14" />
      <path d="M7 21h10" />
    </>
  ),
  usage: (
    <>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <rect x="7" y="12" width="3" height="7" rx="0.5" />
      <rect x="12" y="9" width="3" height="10" rx="0.5" />
      <rect x="17" y="6" width="3" height="13" rx="0.5" />
    </>
  ),
  projects: (
    <>
      <path d="M4 7h16v12H4z" />
      <path d="M4 7l2-3h12l2 3" />
      <path d="M10 11h4" />
    </>
  ),
};

export function ToolMenuIcon({ icon }: { icon: ToolIconId }) {
  return (
    <svg
      className="app-header-dropdown-link-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[icon]}
    </svg>
  );
}
