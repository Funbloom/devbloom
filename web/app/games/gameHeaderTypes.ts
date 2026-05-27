import type { ReactElement } from "react";

export type GameHeaderPipeline = {
  key: string;
  name: string;
};

export type GameHeaderMenuContext = {
  pathname: string;
  activeGameKeyFromPath: string;
  gameName: string;
  pipelines: GameHeaderPipeline[];
};

export type GameHeaderEntry = {
  gameKey: string;
  resolvePageLabel: (pathname: string) => string | null;
  renderMenu: (context: GameHeaderMenuContext) => ReactElement | null;
};
