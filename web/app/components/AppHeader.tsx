"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  dispatchActiveProjectChanged,
  persistActiveProjectToProfile,
  STORAGE_KEY_ACTIVE_PROJECT,
  STORAGE_KEY_ACTIVE_PROJECT_NAME,
} from "../lib/activeProject";
import { API_BASE, fetchApi } from "../lib/api";
import { localAgent, isLocalAgentContext } from "../lib/localAgentClient";

const STUDIO_LINKS: { path: string; label: string }[] = [
  { path: "/storyboard", label: "Storyboard" },
  { path: "/imageGen", label: "Image Gen" },
  { path: "/audio", label: "Voice Gen" },
  { path: "/imageResize", label: "Image Resize" },
  { path: "/meshgen", label: "Mesh Gen" },
  { path: "/uiBuilder", label: "UI Builder" },
];

function humanizeSegment(segment: string): string {
  const s = segment.replace(/_/g, " ").trim();
  if (!s) return segment;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function getCurrentPageLabel(pathname: string): string {
  if (!pathname || pathname === "/") return "Agents";
  if (pathname.startsWith("/admin")) return "Admin";
  if (pathname.startsWith("/settings/usage")) return "Usage";
  if (pathname.startsWith("/storyboard")) return "Storyboard";
  if (pathname.startsWith("/imageGen")) return "Image Gen";
  if (pathname.startsWith("/audio")) return "Voice Gen";
  if (pathname.startsWith("/imageResize")) return "Image Resize";
  if (pathname.startsWith("/meshgen")) return "Mesh Gen";
  if (pathname.startsWith("/uiBuilder")) return "UI Builder";
  const gamesPath = pathname.match(/^\/games\/([^/]+)(?:\/pipelines\/([^/]+))?/);
  if (gamesPath) {
    const gameKey = gamesPath[1];
    const pipelineKey = gamesPath[2];
    if (gameKey === "solitaire" && pipelineKey === "cards") return "Cards";
    if (pipelineKey === "gift_images") return "Gifts";
    if (pipelineKey === "cities") return "Cities";
    if (pipelineKey) return humanizeSegment(pipelineKey);
    return humanizeSegment(gamesPath[1]);
  }
  if (pathname.startsWith("/login")) return "Log in";
  return "Agents";
}

function initials(email: string): string {
  const part = email.split("@")[0];
  const words = part.split(/[._-]/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (part.slice(0, 2) || "?").toUpperCase();
}

type PipelineInfo = { key: string; name: string; description?: string };

type GameRegistryEntry = { key: string; name: string; project_keys: string[] };
type ProjectItem = { project_key: string; display_name: string };

function HeaderMenu({
  label,
  children,
  summaryClassName = "",
  wide,
}: {
  label: ReactNode;
  children: ReactNode;
  summaryClassName?: string;
  wide?: boolean;
}) {
  return (
    <details className="app-header-menu">
      <summary className={`app-header-menu-summary app-header-link ${summaryClassName}`.trim()}>{label}</summary>
      <div className={`app-header-dropdown${wide ? " app-header-dropdown--wide" : ""}`}>{children}</div>
    </details>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const currentLabel = getCurrentPageLabel(pathname ?? "");
  const { authUser, user, signOut, loading } = useAuth();
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [activeProjectName, setActiveProjectName] = useState("");
  const [gamesRegistry, setGamesRegistry] = useState<GameRegistryEntry[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [pipelinesByGameKey, setPipelinesByGameKey] = useState<Record<string, PipelineInfo[]>>({});
  const [localAgentOk, setLocalAgentOk] = useState(false);
  /** This tab’s hostname may call the agent on 127.0.0.1 (localhost or NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS). */
  const [localAgentEligible, setLocalAgentEligible] = useState(false);
  const [apiServerOk, setApiServerOk] = useState(false);

  useEffect(() => {
    setLocalAgentEligible(isLocalAgentContext());
  }, []);

  useEffect(() => {
    const refreshProject = async () => {
      const stored = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
      const storedName = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT_NAME) || "";
      setActiveProjectKey(stored);
      try {
        const response = await fetchApi("/projects");
        if (!response.ok) {
          setProjects([]);
          setActiveProjectName(storedName || stored);
          return;
        }
        const data = (await response.json()) as ProjectItem[];
        setProjects(Array.isArray(data) ? data : []);
        if (!stored) {
          setActiveProjectName("");
          return;
        }
        if (storedName) {
          setActiveProjectName(storedName);
          return;
        }
        const match = data.find((project) => project.project_key === stored);
        const name = match?.display_name || stored;
        setActiveProjectName(name);
        window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT_NAME, name);
      } catch {
        setProjects([]);
        setActiveProjectName(storedName || stored);
      }
    };
    void refreshProject();
    const handleProjectChange = () => {
      void refreshProject();
    };
    window.addEventListener("activeProjectChanged", handleProjectChange);
    window.addEventListener("storage", handleProjectChange);
    return () => {
      window.removeEventListener("activeProjectChanged", handleProjectChange);
      window.removeEventListener("storage", handleProjectChange);
    };
  }, []);

  const selectProject = (project: ProjectItem) => {
    const key = project.project_key.trim();
    if (!key) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, key);
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT_NAME, project.display_name || key);
    dispatchActiveProjectChanged();
    void persistActiveProjectToProfile(key);
  };

  useEffect(() => {
    if (loading) return;
    if (!authUser && !user) {
      setGamesRegistry([]);
      return;
    }
    const loadGames = async () => {
      try {
        const res = await fetchApi("/games");
        if (!res.ok) {
          setGamesRegistry([]);
          return;
        }
        const raw = (await res.json()) as unknown;
        if (!Array.isArray(raw)) {
          setGamesRegistry([]);
          return;
        }
        const parsed: GameRegistryEntry[] = [];
        for (const item of raw) {
          if (!item || typeof item !== "object") continue;
          const rec = item as Record<string, unknown>;
          const key = typeof rec.key === "string" ? rec.key.trim() : "";
          const name = typeof rec.name === "string" ? rec.name.trim() : "";
          const pkRaw = rec.project_keys;
          const project_keys: string[] = [];
          if (Array.isArray(pkRaw)) {
            for (const p of pkRaw) {
              if (typeof p === "string" && p.trim()) project_keys.push(p.trim());
            }
          }
          if (key && name) {
            parsed.push({
              key,
              name,
              project_keys: project_keys.length > 0 ? project_keys : [key],
            });
          }
        }
        setGamesRegistry(parsed);
      } catch {
        setGamesRegistry([]);
      }
    };
    void loadGames();
  }, [loading, authUser, user]);

  const visibleGames = useMemo(
    () => gamesRegistry.filter((g) => activeProjectKey && g.project_keys.includes(activeProjectKey)),
    [gamesRegistry, activeProjectKey],
  );

  useEffect(() => {
    if (!visibleGames.length) {
      setPipelinesByGameKey({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const next: Record<string, PipelineInfo[]> = {};
      await Promise.all(
        visibleGames.map(async (g) => {
          try {
            const res = await fetchApi(`/games/${encodeURIComponent(g.key)}/pipelines`);
            if (!res.ok) {
              next[g.key] = [];
              return;
            }
            const list = (await res.json()) as PipelineInfo[];
            next[g.key] = Array.isArray(list) && list.length > 0 ? list : [];
          } catch {
            next[g.key] = [];
          }
        }),
      );
      if (!cancelled) setPipelinesByGameKey(next);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [visibleGames]);

  useEffect(() => {
    if (!localAgentEligible) return;
    let cancelled = false;
    const check = async () => {
      const ok = await localAgent.health();
      if (!cancelled) setLocalAgentOk(ok);
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [localAgentEligible]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const base = API_BASE.replace(/\/+$/, "");
        const res = await fetch(`${base}/health`, { method: "GET", cache: "no-store" });
        if (!cancelled) setApiServerOk(res.ok);
      } catch {
        if (!cancelled) setApiServerOk(false);
      }
    };
    void check();
    const timer = window.setInterval(check, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const closeAllHeaderMenus = () => {
      document.querySelectorAll("header.app-header details.app-header-menu").forEach((node) => {
        (node as HTMLDetailsElement).open = false;
      });
    };
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const menu = t.closest("details.app-header-menu");
      if (!menu) {
        closeAllHeaderMenus();
        return;
      }
      document.querySelectorAll("header.app-header details.app-header-menu").forEach((node) => {
        if (node !== menu) (node as HTMLDetailsElement).open = false;
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const headerTitle = activeProjectName
    ? `DevBloom Studio (${activeProjectName})`
    : "DevBloom Studio (select a project...)";

  const studioActive = STUDIO_LINKS.some(
    ({ path }) => path === pathname || (path !== "/" && Boolean(pathname?.startsWith(path))),
  );
  const gamesPathMatch = pathname?.match(/^\/games\/([^/]+)/);
  const activeGameKeyFromPath = gamesPathMatch?.[1] ?? "";

  const isAgentsActive = pathname === "/" || pathname === "";
  const adminActive =
    pathname === "/admin" ||
    pathname?.startsWith("/admin/") ||
    pathname?.startsWith("/settings/");

  return (
    <header className="app-header">
      <div className="app-header-page">{currentLabel}</div>
      <div className="app-header-title-block">
        <Link href="/" className="app-header-title">
          {headerTitle}
        </Link>
        <div className="app-header-services">
          <div
            className={`app-header-local-agent${localAgentEligible ? "" : " app-header-local-agent--inactive"}`}
            title={
              localAgentEligible
                ? localAgentOk
                  ? "Local agent online (this PC, port 8765)"
                  : "Local agent offline — start it on this machine (e.g. local_agent/run.bat)"
                : "Gift/cities file tools use a small app on your PC (127.0.0.1:8765). On this host the UI does not call it — use localhost or set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS when building the web app."
            }
          >
            <span
              className="app-header-local-agent-dot"
              style={
                localAgentEligible
                  ? { background: localAgentOk ? "#22c55e" : "#ef4444" }
                  : undefined
              }
            />
            {localAgentEligible ? "Local Agent" : "Local agent — N/A on this host"}
          </div>
          <div
            className="app-header-local-agent"
            title={
              apiServerOk
                ? `API server online (${API_BASE.replace(/\/+$/, "")})`
                : `API server offline — start it (e.g. api/run.bat or uvicorn on port 8000). Expected: ${API_BASE.replace(/\/+$/, "")}`
            }
          >
            <span
              className="app-header-local-agent-dot"
              style={{ background: apiServerOk ? "#22c55e" : "#ef4444" }}
            />
            API Server
          </div>
        </div>
      </div>
      <nav className="app-header-nav" aria-label="Main">
        <div className="app-header-toolbar">
          <Link
            href="/"
            className={`app-header-link ${isAgentsActive ? "app-header-link-active" : ""}`}
          >
            Agents
          </Link>

          <HeaderMenu
            label="Studio"
            summaryClassName={studioActive ? "app-header-link-active" : ""}
            wide
          >
            {STUDIO_LINKS.map(({ path, label }) => {
              const isActive = path === pathname || (path !== "/" && Boolean(pathname?.startsWith(path)));
              return (
                <Link
                  key={path}
                  href={path}
                  className={`app-header-dropdown-link ${isActive ? "app-header-link-active" : ""}`}
                >
                  {label}
                </Link>
              );
            })}
          </HeaderMenu>

          {visibleGames.map((game) => {
            const pipelines = pipelinesByGameKey[game.key] ?? [];
            if (pipelines.length === 0) return null;
            const gameHrefPrefix = `/games/${game.key}`;
            const thisGameActive = activeGameKeyFromPath === game.key;
            return (
              <HeaderMenu
                key={game.key}
                label={game.name}
                summaryClassName={thisGameActive ? "app-header-link-active" : ""}
                wide
              >
                {pipelines.map((pipeline) => {
                  const href = `${gameHrefPrefix}/pipelines/${pipeline.key}`;
                  const isActive = pathname === href || pathname?.startsWith(`${href}/`);
                  return (
                    <Link
                      key={pipeline.key}
                      href={href}
                      className={`app-header-dropdown-link ${isActive ? "app-header-link-active" : ""}`}
                    >
                      {pipeline.name}
                    </Link>
                  );
                })}
              </HeaderMenu>
            );
          })}

          <HeaderMenu
            label="Settings"
            summaryClassName={adminActive ? "app-header-link-active" : ""}
            wide
          >
            <Link
              href="/admin"
              className={`app-header-dropdown-link ${pathname === "/admin" ? "app-header-link-active" : ""}`}
            >
              Admin
            </Link>
            <Link
              href="/admin/installation"
              className={`app-header-dropdown-link ${pathname === "/admin/installation" ? "app-header-link-active" : ""}`}
            >
              Installation
            </Link>
            <Link
              href="/settings/usage"
              className={`app-header-dropdown-link ${pathname === "/settings/usage" ? "app-header-link-active" : ""}`}
            >
              Usage
            </Link>
            <details className="app-header-submenu app-header-submenu--side">
              <summary className="app-header-dropdown-link app-header-submenu-summary">
                Projects
              </summary>
              <div className="app-header-submenu-list app-header-submenu-list--side">
                {projects.length === 0 ? (
                  <div className="app-header-dropdown-muted">No projects found.</div>
                ) : (
                  projects.map((project) => {
                    const isActiveProject = activeProjectKey === project.project_key;
                    return (
                      <button
                        key={project.project_key}
                        type="button"
                        onClick={() => selectProject(project)}
                        className={`app-header-dropdown-link app-header-dropdown-action ${isActiveProject ? "app-header-link-active" : ""}`}
                        title={project.project_key}
                      >
                        {project.display_name || project.project_key}
                      </button>
                    );
                  })
                )}
              </div>
            </details>
          </HeaderMenu>

          <div className="app-header-user" style={{ display: "flex", alignItems: "center" }}>
            {!loading &&
              (authUser || user ? (
                <HeaderMenu
                  label={
                    <span className="app-header-avatar" title={authUser?.email ?? user?.email ?? ""}>
                      {initials(authUser?.email ?? user?.email ?? "")}
                    </span>
                  }
                  summaryClassName="app-header-menu-summary-avatar"
                >
                  <div className="app-header-account-email">{authUser?.email ?? user?.email}</div>
                  <button
                    type="button"
                    onClick={() => signOut()}
                    className="app-header-dropdown-link"
                    style={{ cursor: "pointer", width: "100%", textAlign: "left", border: "none", font: "inherit", background: "none" }}
                  >
                    Log out
                  </button>
                </HeaderMenu>
              ) : (
                <Link href="/login" className="app-header-link">
                  Log in
                </Link>
              ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
