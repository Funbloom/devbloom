"use client";

import Link from "next/link";
import type { ReactElement } from "react";

import { HeaderMenu } from "../../../components/HeaderMenu";
import { POCKET_VOYAGER_GAME_KEY, type PocketVoyagerPipelineNavItem } from "./pocketVoyagerNav";

type Props = {
  gameName: string;
  pathname: string;
  pipelines: PocketVoyagerPipelineNavItem[];
  activeGameKeyFromPath: string;
};

export function PocketVoyagerHeaderMenu({
  gameName,
  pathname,
  pipelines,
  activeGameKeyFromPath,
}: Props): ReactElement | null {
  if (pipelines.length === 0) {
    return null;
  }

  const thisGameActive = activeGameKeyFromPath === POCKET_VOYAGER_GAME_KEY;

  return (
    <HeaderMenu label={gameName} summaryClassName={thisGameActive ? "app-header-link-active" : ""} wide>
      {pipelines.map((pipeline) => {
        const isActive = pathname === pipeline.href || pathname.startsWith(`${pipeline.href}/`);
        return (
          <Link
            key={pipeline.key}
            href={pipeline.href}
            className={`app-header-dropdown-link ${isActive ? "app-header-link-active" : ""}`}
          >
            {pipeline.name}
          </Link>
        );
      })}
    </HeaderMenu>
  );
}
