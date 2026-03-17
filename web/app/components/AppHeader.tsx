"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { fetchApi } from "../lib/api";

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

export function AppHeader() {
  const pathname = usePathname();
  const currentLabel = getCurrentPageLabel(pathname ?? "");
  const { authUser, user, signOut, loading } = useAuth();
  const [activeProjectKey, setActiveProjectKey] = useState("");
  const [activeProjectName, setActiveProjectName] = useState("");

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

  const headerTitle = activeProjectName
    ? `DevBloom Studio (${activeProjectName})`
    : "DevBloom Studio (select a project...)";

  return (
    <header className="app-header">
      <div className="app-header-page">{currentLabel}</div>
      <Link href="/" className="app-header-title">
        {headerTitle}
      </Link>
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
        <div className="app-header-user" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem" }}>
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
