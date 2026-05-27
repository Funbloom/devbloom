/** Pocket Voyager routes and header labels. */

export const POCKET_VOYAGER_GAME_KEY = "pocket_voyager";

export const POCKET_VOYAGER_GAME_NAME = "Pocket Voyager";

export type PocketVoyagerPipelineKey = "gift_images" | "cities" | "narrative";

export const POCKET_VOYAGER_PIPELINE_PAGE_LABELS: Record<PocketVoyagerPipelineKey, string> = {
  gift_images: "Gifts",
  cities: "Cities",
  narrative: "Narrative",
};

export type PocketVoyagerPipelineNavItem = {
  key: string;
  name: string;
  href: string;
};

export function pocketVoyagerPipelineHref(pipelineKey: string): string {
  return `/games/${POCKET_VOYAGER_GAME_KEY}/pipelines/${pipelineKey}`;
}

export function parsePocketVoyagerPath(pathname: string): {
  gameKey: string;
  pipelineKey: string | undefined;
} | null {
  const match = pathname.match(/^\/games\/([^/]+)(?:\/pipelines\/([^/]+))?/);
  if (!match || match[1] !== POCKET_VOYAGER_GAME_KEY) {
    return null;
  }
  return { gameKey: match[1], pipelineKey: match[2] };
}

export function resolvePocketVoyagerPageLabel(pathname: string): string | null {
  const parsed = parsePocketVoyagerPath(pathname);
  if (!parsed) {
    return null;
  }
  if (!parsed.pipelineKey) {
    return POCKET_VOYAGER_GAME_NAME;
  }
  const label = POCKET_VOYAGER_PIPELINE_PAGE_LABELS[parsed.pipelineKey as PocketVoyagerPipelineKey];
  if (label) {
    return label;
  }
  return null;
}

export function buildPocketVoyagerPipelineNavItems(
  pipelines: Array<{ key: string; name: string }>
): PocketVoyagerPipelineNavItem[] {
  return pipelines.map((pipeline) => ({
    key: pipeline.key,
    name: pipeline.name,
    href: pocketVoyagerPipelineHref(pipeline.key),
  }));
}
