import type { ReactElement } from "react";

import type { GameHeaderEntry, GameHeaderMenuContext } from "./gameHeaderTypes";
import { pocketVoyagerHeaderEntry } from "./pocket_voyager/header/register";

const GAME_HEADER_ENTRIES: GameHeaderEntry[] = [pocketVoyagerHeaderEntry];

export function resolveRegisteredGamePageLabel(pathname: string): string | null {
  for (const entry of GAME_HEADER_ENTRIES) {
    const label = entry.resolvePageLabel(pathname);
    if (label) {
      return label;
    }
  }
  return null;
}

export function renderRegisteredGameHeaderMenu(
  gameKey: string,
  context: GameHeaderMenuContext
): ReactElement | null {
  const entry = GAME_HEADER_ENTRIES.find((item) => item.gameKey === gameKey);
  if (!entry) {
    return null;
  }
  return entry.renderMenu(context);
}
