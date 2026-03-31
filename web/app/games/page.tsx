"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchApi } from "../lib/api";

type GameInfo = { key: string; name: string };
type PipelineInfo = { key: string; name: string; description?: string };

export default function GamesIndexPage() {
  const [games, setGames] = useState<GameInfo[]>([]);
  const [pipelinesByGame, setPipelinesByGame] = useState<Record<string, PipelineInfo[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetchApi("/games");
        if (!res.ok) {
          setError(`Failed to load games: ${res.status}`);
          return;
        }
        const data = (await res.json()) as GameInfo[];
        setGames(data);
        for (const game of data) {
          const pipeRes = await fetchApi(`/games/${game.key}/pipelines`);
          if (!pipeRes.ok) continue;
          const pipelines = (await pipeRes.json()) as PipelineInfo[];
          setPipelinesByGame((prev) => ({ ...prev, [game.key]: pipelines }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load games.");
      }
    };
    void load();
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1rem" }}>
      <h1 style={{ marginBottom: "1rem" }}>Games</h1>
      {error && (
        <div role="alert" style={{ color: "var(--error, #c00)", marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {games.length === 0 ? (
        <div style={{ color: "var(--muted, #94a3b8)" }}>No games configured.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {games.map((game) => (
            <div
              key={game.key}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.2)",
                borderRadius: 8,
                padding: "1rem",
              }}
            >
              <h2 style={{ marginBottom: "0.5rem" }}>{game.name}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {(pipelinesByGame[game.key] || []).map((pipeline) => (
                  <Link
                    key={pipeline.key}
                    href={`/games/${game.key}/pipelines/${pipeline.key}`}
                    style={{ textDecoration: "none", color: "var(--header-link-color, #3b82f6)" }}
                  >
                    {pipeline.name}
                  </Link>
                ))}
                {(pipelinesByGame[game.key] || []).length === 0 && (
                  <div style={{ color: "var(--muted, #94a3b8)" }}>No pipelines.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
