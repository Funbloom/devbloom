"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function AppHeader() {
  const pathname = usePathname();
  const currentLabel = getCurrentPageLabel(pathname ?? "");

  return (
    <header className="app-header">
      <div className="app-header-page">{currentLabel}</div>
      <Link href="/" className="app-header-title">
        DevBloom Studio
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
      </nav>
    </header>
  );
}
