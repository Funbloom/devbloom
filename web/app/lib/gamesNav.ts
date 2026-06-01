import { GAME_MANIFESTS } from "./gameManifests";

export type GameNavPipeline = { key: string; name: string; description?: string };

export type GameManifest = {
  key: string;
  name: string;
  project_keys?: string[];
  pipelines: GameNavPipeline[];
};

export type GameNavEntry = {
  key: string;
  name: string;
  project_keys: string[];
  pipelines: GameNavPipeline[];
};

function parsePipelines(raw: GameManifest["pipelines"]): GameNavPipeline[] {
  const out: GameNavPipeline[] = [];
  for (const p of raw ?? []) {
    const key = (p.key ?? "").trim();
    const name = (p.name ?? "").trim();
    if (key && name) {
      out.push({ key, name, description: (p.description ?? "").trim() || undefined });
    }
  }
  return out;
}

function manifestToEntry(m: GameManifest): GameNavEntry | null {
  const key = (m.key ?? "").trim();
  const name = (m.name ?? "").trim();
  if (!key || !name) {
    return null;
  }
  const project_keys: string[] = [];
  if (Array.isArray(m.project_keys)) {
    for (const p of m.project_keys) {
      if (typeof p === "string" && p.trim()) {
        project_keys.push(p.trim());
      }
    }
  }
  return {
    key,
    name,
    project_keys: project_keys.length > 0 ? project_keys : [key],
    pipelines: parsePipelines(m.pipelines),
  };
}

/** All games from per-game manifests — used when /games API is unavailable. */
export function gamesFromManifest(): GameNavEntry[] {
  const out: GameNavEntry[] = [];
  for (const m of GAME_MANIFESTS) {
    const entry = manifestToEntry(m as GameManifest);
    if (entry) {
      out.push(entry);
    }
  }
  return out;
}

/** Pipelines from games/<game_key>/manifest.json (works even if /games/{key}/pipelines fails). */
export function pipelinesFromManifest(gameKey: string): GameNavPipeline[] {
  const game = (GAME_MANIFESTS as GameManifest[]).find((g) => (g.key ?? "").trim() === gameKey);
  if (!game) {
    return [];
  }
  return parsePipelines(game.pipelines);
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
  return games;
}
