"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchApi } from "../lib/api";
import { localAgent, isLocalAgentContext } from "../lib/localAgentClient";

const PAGES: { path: string; label: string }[] = [
  { path: "/", label: "Agents" },
  { path: "/admin", label: "Admin" },
  { path: "/storyboard", label: "Storyboard" },
  { path: "/imageGen", label: "Image Gen" },
];

function getCurrentPageLabel(pathname: string): string {
  const page = PAGES.find((p) => p.path === pathname || (p.path !== "/" && pathname.startsWith(p.path)));
  return page?.label ?? "Agents";
}

function initials(email: string): string {
  const part = email.split("@")[0];
  const words = part.split(/[._-]/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (part.slice(0, 2) || "?").toUpperCase();
}

type GameInfo = { key: string; name: string };
type PipelineInfo = { key: string; name: string; description?: string };

export function AppHeader() {
  const pathname = usePathname();
  const currentLabel = getCurrentPageLabel(pathname ?? "");
  const { authUser, user, signOut, loading } = useAuth();
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [activeProjectName, setActiveProjectName] = useState("");
  const [games, setGames] = useState<GameInfo[]>([]);
  const [pipelinesByGame, setPipelinesByGame] = useState<Record<string, PipelineInfo[]>>({});
  const [localAgentOk, setLocalAgentOk] = useState(false);
  /** This tab’s hostname may call the agent on 127.0.0.1 (localhost or NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS). */
  const [localAgentEligible, setLocalAgentEligible] = useState(false);

  useEffect(() => {
    setLocalAgentEligible(isLocalAgentContext());
  }, []);

  useEffect(() => {
    const refreshProject = async () => {
      const stored = window.localStorage.getItem("activeProjectKey") || "";
      const storedName = window.localStorage.getItem("activeProjectName") || "";
      setActiveProjectKey(stored);
      if (!stored) {
        setActiveProjectName("");
        return;
      }
      if (storedName) {
        setActiveProjectName(storedName);
        return;
      }
      try {
        const response = await fetchApi("/projects");
        if (!response.ok) {
          setActiveProjectName(stored);
          return;
        }
        const data = (await response.json()) as { project_key: string; display_name: string }[];
        const match = data.find((project) => project.project_key === stored);
        const name = match?.display_name || stored;
        setActiveProjectName(name);
        window.localStorage.setItem("activeProjectName", name);
      } catch {
        setActiveProjectName(stored);
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

  useEffect(() => {
    if (loading) return;
    if (!authUser && !user) {
      setGames([]);
      setPipelinesByGame({});
      return;
    }
    const loadGames = async () => {
      try {
        const response = await fetchApi("/games");
        if (!response.ok) return;
        const data = (await response.json()) as GameInfo[];
        setGames(data);
        for (const game of data) {
          try {
            const pipelinesRes = await fetchApi(`/games/${game.key}/pipelines`);
            if (!pipelinesRes.ok) continue;
            const pipelines = (await pipelinesRes.json()) as PipelineInfo[];
            setPipelinesByGame((prev) => ({ ...prev, [game.key]: pipelines }));
          } catch {
            // Ignore pipeline load errors.
          }
        }
      } catch {
        // Ignore game load errors.
      }
    };
    void loadGames();
  }, [loading, authUser, user]);

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

  const headerTitle = activeProjectName
    ? `DevBloom Studio (${activeProjectName})`
    : "DevBloom Studio (select a project...)";

  return (
    <header className="app-header">
      <div className="app-header-page">{currentLabel}</div>
      <div className="app-header-title-block">
        <Link href="/" className="app-header-title">
          {headerTitle}
        </Link>
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
      </div>
      <nav className="app-header-nav">
        {PAGES.map(({ path, label }) => {
          const isActive = path === pathname || (path !== "/" && pathname?.startsWith(path));
          return (
            <Link
              key={path}
              href={path}
              className={`app-header-link ${isActive ? "app-header-link-active" : ""}`}
            >
              {label}
            </Link>
          );
        })}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {games.length === 0 ? (
            <Link href="/games" className="app-header-link">
              Games
            </Link>
          ) : (
            games.map((game) => {
              const pipelines = pipelinesByGame[game.key] || [];
              return (
                <details key={game.key} style={{ position: "relative" }}>
                  <summary className="app-header-link" style={{ cursor: "pointer", listStyle: "none" }}>
                    {game.name}
                  </summary>
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "110%",
                      background: "var(--panel-bg, #0f172a)",
                      border: "1px solid rgba(148, 163, 184, 0.2)",
                      borderRadius: 8,
                      padding: "0.5rem",
                      minWidth: 180,
                      zIndex: 10,
                    }}
                  >
                    {pipelines.length === 0 ? (
                      <div style={{ fontSize: 12, color: "var(--muted, #94a3b8)" }}>No pipelines</div>
                    ) : (
                      pipelines.map((pipeline) => (
                        <Link
                          key={pipeline.key}
                          href={`/games/${game.key}/pipelines/${pipeline.key}`}
                          className="app-header-link"
                          style={{ display: "block", padding: "0.25rem 0" }}
                        >
                          {pipeline.name}
                        </Link>
                      ))
                    )}
                    <Link
                      href="/games"
                      className="app-header-link"
                      style={{ display: "block", padding: "0.25rem 0", opacity: 0.8 }}
                    >
                      View all
                    </Link>
                  </div>
                </details>
              );
            })
          )}
        </div>
        <div className="app-header-user" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {!loading && (
            authUser || user ? (
              <>
                <span className="app-header-avatar" title={authUser?.email ?? user?.email ?? ""} style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--header-link-color, #3b82f6)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                  {initials(authUser?.email ?? user?.email ?? "")}
                </span>
                <span className="app-header-email" style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {authUser?.email ?? user?.email}
                </span>
                <button type="button" onClick={() => signOut()} className="app-header-link" style={{ cursor: "pointer", background: "none", border: "none", font: "inherit" }}>
                  Log out
                </button>
              </>
            ) : (
              <Link href="/login" className="app-header-link">
                Log in
              </Link>
            )
          )}
        </div>
      </nav>
    </header>
  );
}
