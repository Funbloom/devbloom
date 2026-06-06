"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  renderRegisteredGameHeaderMenu,
  resolveRegisteredGamePageLabel,
} from "../games/gameHeaderRegistry";
import {
  dispatchActiveProjectChanged,
  persistActiveProjectToProfile,
  STORAGE_KEY_ACTIVE_PROJECT,
  STORAGE_KEY_ACTIVE_PROJECT_NAME,
} from "../lib/activeProject";
import { API_BASE, fetchApi } from "../lib/api";
import { projectKeyFromDisplayName } from "../lib/projectKey";
import { localAgent, isLocalAgentContext } from "../lib/localAgentClient";
import {
  gamesFromManifest,
  parseGamesApiList,
  pipelinesFromManifest,
  visibleGamesForProject,
  type GameNavEntry,
  type GameNavPipeline,
} from "../lib/gamesNav";
import { closeAllHeaderMenus, HeaderMenu } from "./HeaderMenu";
import { ToolMenuIcon, type ToolIconId } from "./ToolMenuIcon";

type ToolsLink = { path: string; label: string; icon: ToolIconId };

type ToolsCategory = { category: string; links: ToolsLink[] };

const TOOLS_CATEGORIES: ToolsCategory[] = [
  {
    category: "Image",
    links: [
      { path: "/imageGen", label: "Image Gen", icon: "imageGen" },
      { path: "/imageResize", label: "Image Resize", icon: "imageResize" },
    ],
  },
  {
    category: "Audio",
    links: [
      { path: "/audio", label: "Voice Gen", icon: "voiceGen" },
      { path: "/audiobank", label: "Audiobank", icon: "audiobank" },
    ],
  },
  {
    category: "UI",
    links: [{ path: "/uiBuilder", label: "UI Builder", icon: "uiBuilder" }],
  },
  {
    category: "3D",
    links: [{ path: "/meshgen", label: "Mesh Gen", icon: "meshGen" }],
  },
  {
    category: "Story",
    links: [
      { path: "/storyboard", label: "Storyboard", icon: "storyboard" },
      { path: "/planning", label: "Planning", icon: "planning" },
    ],
  },
];

const TOOLS_LINKS: ToolsLink[] = TOOLS_CATEGORIES.flatMap((group) => group.links);
const AGENTS_PATH = "/";

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
  if (pathname.startsWith("/planning")) return "Planning";
  if (pathname.startsWith("/imageGen")) return "Image Gen";
  if (pathname.startsWith("/audio")) return "Voice Gen";
  if (pathname.startsWith("/audiobank")) return "Audiobank";
  if (pathname.startsWith("/imageResize")) return "Image Resize";
  if (pathname.startsWith("/meshgen")) return "Mesh Gen";
  if (pathname.startsWith("/uiBuilder")) return "UI Builder";

  const registeredLabel = resolveRegisteredGamePageLabel(pathname);
  if (registeredLabel) {
    return registeredLabel;
  }

  const gamesPath = pathname.match(/^\/games\/([^/]+)(?:\/pipelines\/([^/]+))?/);
  if (gamesPath) {
    const gameKey = gamesPath[1];
    const pipelineKey = gamesPath[2];
    if (gameKey === "solitaire" && pipelineKey === "cards") return "Cards";
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

type ProjectItem = { project_key: string; display_name: string };

export function AppHeader() {
  const pathname = usePathname();
  const currentLabel = getCurrentPageLabel(pathname ?? "");
  const { authUser, user, signOut, loading } = useAuth();
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [activeProjectName, setActiveProjectName] = useState("");
  const [gamesRegistry, setGamesRegistry] = useState<GameNavEntry[]>(() => gamesFromManifest());
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [pipelinesByGameKey, setPipelinesByGameKey] = useState<Record<string, GameNavPipeline[]>>({});
  const [localAgentOk, setLocalAgentOk] = useState(false);
  const [localAgentEligible, setLocalAgentEligible] = useState(false);
  const [apiServerOk, setApiServerOk] = useState(false);

  useEffect(() => {
    setLocalAgentEligible(isLocalAgentContext());
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    const refreshProject = async () => {
      const stored = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
      const storedName = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT_NAME) || "";
      setActiveProjectKey(stored);

      if (!authUser && !user) {
        setProjects([]);
        setActiveProjectName("");
        return;
      }

      try {
        const response = await fetchApi("/projects");
        if (!response.ok) {
          setProjects([]);
          setActiveProjectName(storedName || stored);
          return;
        }
        const data = (await response.json()) as ProjectItem[];
        const list = Array.isArray(data) ? data : [];
        setProjects(list);
        if (!stored) {
          setActiveProjectName("");
          return;
        }
        if (storedName) {
          setActiveProjectName(storedName);
          return;
        }
        const match = list.find((project) => project.project_key === stored);
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
      const stored = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
      setActiveProjectKey(stored);
      void refreshProject();
    };
    window.addEventListener("activeProjectChanged", handleProjectChange);
    window.addEventListener("storage", handleProjectChange);
    return () => {
      window.removeEventListener("activeProjectChanged", handleProjectChange);
      window.removeEventListener("storage", handleProjectChange);
    };
  }, [loading, authUser, user]);

  const selectProject = (project: ProjectItem) => {
    const key = project.project_key.trim();
    if (!key) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT, key);
    window.localStorage.setItem(STORAGE_KEY_ACTIVE_PROJECT_NAME, project.display_name || key);
    setActiveProjectKey(key);
    setActiveProjectName(project.display_name || key);
    closeAllHeaderMenus();
    dispatchActiveProjectChanged();
    void persistActiveProjectToProfile(key);
  };

  useEffect(() => {
    if (loading) {
      return;
    }
    if (!authUser && !user) {
      setGamesRegistry(gamesFromManifest());
      return;
    }
    const loadGames = async () => {
      const manifest = gamesFromManifest();
      try {
        const res = await fetchApi("/games");
        if (res.ok) {
          const parsed = parseGamesApiList((await res.json()) as unknown);
          if (parsed.length > 0) {
            setGamesRegistry(parsed);
            return;
          }
        }
      } catch {
        // fall through to manifest
      }
      setGamesRegistry(manifest);
    };
    void loadGames();
  }, [loading, authUser, user]);

  const effectiveProjectKey = useMemo(() => {
    const key = activeProjectKey.trim();
    if (key) {
      return key;
    }
    const name = activeProjectName.trim().toLowerCase();
    if (!name) {
      return "";
    }
    const byDisplay = projects.find(
      (p) => (p.display_name || "").trim().toLowerCase() === name,
    );
    if (byDisplay?.project_key?.trim()) {
      return byDisplay.project_key.trim();
    }
    return projectKeyFromDisplayName(activeProjectName);
  }, [activeProjectKey, activeProjectName, projects]);

  const visibleGames = useMemo(
    () => visibleGamesForProject(gamesRegistry, effectiveProjectKey),
    [gamesRegistry, effectiveProjectKey],
  );

  const visibleGameKeys = useMemo(
    () => visibleGames.map((g) => g.key).sort().join(","),
    [visibleGames],
  );

  useEffect(() => {
    if (!visibleGameKeys) {
      setPipelinesByGameKey({});
      return;
    }
    const keys = visibleGameKeys.split(",").filter(Boolean);
    setPipelinesByGameKey((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (!(key in next)) {
          const manifest = pipelinesFromManifest(key);
          if (manifest.length > 0) {
            next[key] = manifest;
          }
        }
      }
      return next;
    });

    let cancelled = false;
    const load = async () => {
      const next: Record<string, GameNavPipeline[]> = {};
      await Promise.all(
        keys.map(async (gameKey) => {
          const fallback = pipelinesFromManifest(gameKey);
          try {
            const res = await fetchApi(`/games/${encodeURIComponent(gameKey)}/pipelines`);
            if (!res.ok) {
              next[gameKey] = fallback;
              return;
            }
            const list = (await res.json()) as GameNavPipeline[];
            next[gameKey] =
              Array.isArray(list) && list.length > 0 ? list : fallback;
          } catch {
            next[gameKey] = fallback;
          }
        }),
      );
      if (!cancelled) {
        setPipelinesByGameKey((prev) => ({ ...prev, ...next }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [visibleGameKeys]);

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
    closeAllHeaderMenus();
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest("button.app-header-dropdown-action")?.closest("details.app-header-submenu")) {
        return;
      }
      if (t.closest("details.app-header-submenu")) {
        return;
      }
      const menu = t.closest("details.app-header-menu");
      if (!menu) {
        closeAllHeaderMenus();
        return;
      }
      document.querySelectorAll("header.app-header details.app-header-menu").forEach((node) => {
        if (node !== menu) {
          (node as HTMLDetailsElement).open = false;
        }
      });
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const headerTitle = activeProjectName
    ? `DevBloom Studio (${activeProjectName})`
    : "DevBloom Studio (select a project...)";

  const toolsActive =
    pathname === AGENTS_PATH ||
    pathname === "" ||
    TOOLS_LINKS.some(
      ({ path }) => path === pathname || (path !== "/" && Boolean(pathname?.startsWith(path))),
    );
  const gamesPathMatch = pathname?.match(/^\/games\/([^/]+)/);
  const activeGameKeyFromPath = gamesPathMatch?.[1] ?? "";

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
                : "Project file tools use a small app on your PC (127.0.0.1:8765). On this host the UI does not call it — use localhost or set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS when building the web app."
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
          <HeaderMenu
            label="Tools"
            summaryClassName={toolsActive ? "app-header-link-active" : ""}
            wide
          >
            <Link
              href={AGENTS_PATH}
              className={`app-header-dropdown-link ${
                pathname === AGENTS_PATH || pathname === "" ? "app-header-link-active" : ""
              }`}
            >
              <ToolMenuIcon icon="agents" />
              Agents
            </Link>
            <div className="app-header-dropdown-divider" aria-hidden />
            {TOOLS_CATEGORIES.map((group) => (
              <div key={group.category} className="app-header-dropdown-group">
                <div className="app-header-dropdown-group-label">{group.category}</div>
                {group.links.map(({ path, label, icon }) => {
                  const isActive =
                    path === pathname || (path !== "/" && Boolean(pathname?.startsWith(path)));
                  return (
                    <Link
                      key={path}
                      href={path}
                      className={`app-header-dropdown-link ${isActive ? "app-header-link-active" : ""}`}
                    >
                      <ToolMenuIcon icon={icon} />
                      {label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </HeaderMenu>

          {visibleGames.map((game) => {
            const pipelines =
              pipelinesByGameKey[game.key]?.length
                ? pipelinesByGameKey[game.key]
                : game.pipelines.length
                  ? game.pipelines
                  : pipelinesFromManifest(game.key);
            if (pipelines.length === 0) {
              return null;
            }

            const registeredMenu = renderRegisteredGameHeaderMenu(game.key, {
              pathname: pathname ?? "",
              activeGameKeyFromPath,
              gameName: game.name,
              pipelines,
            });
            if (registeredMenu) {
              return <span key={game.key}>{registeredMenu}</span>;
            }

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
            label="Projects"
            summaryClassName={effectiveProjectKey ? "app-header-link-active" : ""}
            wide
          >
            {projects.length === 0 ? (
              <div className="app-header-dropdown-muted">No projects found.</div>
            ) : (
              <div className="app-header-projects-list">
                {projects.map((project) => {
                  const isActiveProject =
                    effectiveProjectKey === project.project_key ||
                    activeProjectKey === project.project_key;
                  return (
                    <button
                      key={project.project_key}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        selectProject(project);
                      }}
                      className={`app-header-dropdown-link app-header-dropdown-action ${isActiveProject ? "app-header-link-active" : ""}`}
                      title={project.project_key}
                    >
                      {project.display_name || project.project_key}
                    </button>
                  );
                })}
              </div>
            )}
          </HeaderMenu>

          <HeaderMenu
            label="Settings"
            summaryClassName={adminActive ? "app-header-link-active" : ""}
            wide
          >
            <Link
              href="/admin"
              className={`app-header-dropdown-link ${pathname === "/admin" ? "app-header-link-active" : ""}`}
            >
              <ToolMenuIcon icon="admin" />
              Admin
            </Link>
            <Link
              href="/admin/installation"
              className={`app-header-dropdown-link ${pathname === "/admin/installation" ? "app-header-link-active" : ""}`}
            >
              <ToolMenuIcon icon="installation" />
              Installation
            </Link>
            <Link
              href="/settings/usage"
              className={`app-header-dropdown-link ${pathname === "/settings/usage" ? "app-header-link-active" : ""}`}
            >
              <ToolMenuIcon icon="usage" />
              Usage
            </Link>
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
                    style={{
                      cursor: "pointer",
                      width: "100%",
                      textAlign: "left",
                      border: "none",
                      font: "inherit",
                      background: "none",
                    }}
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
