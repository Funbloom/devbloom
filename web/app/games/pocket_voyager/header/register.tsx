"use client";

import type { GameHeaderEntry } from "../../gameHeaderTypes";
import { PocketVoyagerHeaderMenu } from "./PocketVoyagerHeaderMenu";
import {
  buildPocketVoyagerPipelineNavItems,
  POCKET_VOYAGER_GAME_KEY,
  resolvePocketVoyagerPageLabel,
} from "./pocketVoyagerNav";

export const pocketVoyagerHeaderEntry: GameHeaderEntry = {
  gameKey: POCKET_VOYAGER_GAME_KEY,
  resolvePageLabel: resolvePocketVoyagerPageLabel,
  renderMenu: (context) => (
    <PocketVoyagerHeaderMenu
      gameName={context.gameName}
      pathname={context.pathname}
      pipelines={buildPocketVoyagerPipelineNavItems(context.pipelines)}
      activeGameKeyFromPath={context.activeGameKeyFromPath}
    />
  ),
};
