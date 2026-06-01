import gamesManifest from "../../../games/manifest.json";

export type GameNavPipeline = { key: string; name: string; description?: string };

export type GameNavEntry = {
  key: string;
  name: string;
  project_keys: string[];
  pipelines: GameNavPipeline[];
};

type ManifestGame = {
  key?: string;
  name?: string;
  project_keys?: string[];
  pipelines?: Array<{ key?: string; name?: string; description?: string }>;
};

function manifestGames(): ManifestGame[] {
  return (gamesManifest as { games?: ManifestGame[] }).games ?? [];
}

/** All games from games/manifest.json — used when /games API is unavailable. */
export function gamesFromManifest(): GameNavEntry[] {
  const out: GameNavEntry[] = [];
  for (const g of manifestGames()) {
    const key = (g.key ?? "").trim();
    const name = (g.name ?? "").trim();
    if (!key || !name) {
      continue;
    }
    const project_keys: string[] = [];
    if (Array.isArray(g.project_keys)) {
      for (const p of g.project_keys) {
        if (typeof p === "string" && p.trim()) {
          project_keys.push(p.trim());
        }
      }
    }
    out.push({
      key,
      name,
      project_keys: project_keys.length > 0 ? project_keys : [key],
      pipelines: pipelinesFromManifest(key),
    });
  }
  return out;
}

/** Pipelines from games/manifest.json (works even if /games/{key}/pipelines fails). */
export function pipelinesFromManifest(gameKey: string): GameNavPipeline[] {
  const game = manifestGames().find((g) => (g.key ?? "").trim() === gameKey);
  if (!game?.pipelines) {
    return [];
  }
  const out: GameNavPipeline[] = [];
  for (const p of game.pipelines) {
    const key = (p.key ?? "").trim();
    const name = (p.name ?? "").trim();
    if (key && name) {
      out.push({ key, name, description: (p.description ?? "").trim() || undefined });
    }
  }
  return out;
}

export function parseGamesApiList(raw: unknown): GameNavEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const parsed: GameNavEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.trim() : "";
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const pkRaw = rec.project_keys;
    const project_keys: string[] = [];
    if (Array.isArray(pkRaw)) {
      for (const p of pkRaw) {
        if (typeof p === "string" && p.trim()) {
          project_keys.push(p.trim());
        }
      }
    }
    if (key && name) {
      parsed.push({
        key,
        name,
        project_keys: project_keys.length > 0 ? project_keys : [key],
        pipelines: pipelinesFromManifest(key),
      });
    }
  }
  return parsed;
}

/** Whether this game should appear in the header for the active studio project. */
export function gameVisibleForProject(game: GameNavEntry, activeProjectKey: string): boolean {
  const pk = activeProjectKey.trim();
  if (!pk) {
    return false;
  }
  if (game.project_keys.includes(pk)) {
    return true;
  }
  if (game.key === pk) {
    return true;
  }
  return false;
}

export function visibleGamesForProject(games: GameNavEntry[], activeProjectKey: string): GameNavEntry[] {
  const pk = activeProjectKey.trim();
  if (!pk) {
    return [];
  }
  const matched = games.filter((g) => gameVisibleForProject(g, pk));
  if (matched.length > 0) {
    return matched;
  }
  // Project selected but no explicit mapping — show all games (studio default).
  return games;
}
