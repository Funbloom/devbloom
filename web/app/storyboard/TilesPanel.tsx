"use client";

import { useState } from "react";

import type { Character, Location, Storyboard, Tile } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** Use same-origin URLs for images so they work when API is on another host/port (e.g. Mac). */
function imageSrc(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return url.startsWith("/") ? url : `/${url}`;
}

type Props = {
  storyboard: Storyboard | null;
  tiles: Tile[];
  characters: Character[];
  locations: Location[];
  isSaving: boolean;
  generatingTileId: string | null;
  tilesPerRow: number;
  onTilesPerRowChange: (n: number) => void;
  status: string | null;

  newTilePrompt: string;
  newTileImage: string;
  onNewTilePromptChange: (value: string) => void;
  onNewTileImageChange: (value: string) => void;
  onAddTile: () => void;

  editingTileId: string | null;
  editingTilePrompt: string;
  onEditTileStart: (tile: Tile) => void;
  onCancelEditTile: () => void;
  onSaveTileEdit: (tile: Tile) => void;
  onReorderTiles: (fromIndex: number, toIndex: number) => void;
  onGenerateTile: (tile: Tile) => void;
  onUpdateTileInputs: (tileId: string, updates: { prompt?: string; location_id?: string | null; character_ids?: string[] | null }) => void;
};

export function TilesPanel(props: Props) {
  const {
    storyboard,
    tiles,
    characters,
    locations,
    isSaving,
    generatingTileId,
    tilesPerRow,
    onTilesPerRowChange,
    status,
    newTilePrompt,
    newTileImage,
    onNewTilePromptChange,
    onNewTileImageChange,
    onAddTile,
    onReorderTiles,
    onGenerateTile,
    onUpdateTileInputs,
  } = props;

  const [selectedCharacterByTile, setSelectedCharacterByTile] = useState<Record<string, string>>({});
  const [promptByTile, setPromptByTile] = useState<Record<string, string>>({});
  const [presentationMode, setPresentationMode] = useState(false);

  return (
    <div className="chat-right" style={{ flexBasis: "75%", maxWidth: "75%", position: "relative" }}>
      {generatingTileId && (
        <div className="generate-overlay" aria-live="polite">
          <div className="generate-spinner" />
          <div className="generate-overlay-text">Generating image…</div>
        </div>
      )}
      {!storyboard && <div className="status">Select or create a storyboard to get started.</div>}
      {storyboard && (
        <div className="chat-transcript">
          <div className="chat-top" style={{ marginBottom: 8 }}>
            <div className="chat-header">Tiles for {storyboard.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="edit-actions" style={{ alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 14, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={presentationMode}
                    onChange={(e) => setPresentationMode(e.target.checked)}
                    aria-label="Presentation mode: show only tile images"
                  />
                  Presentation Mode
                </label>
              </div>
              <div className="edit-actions" style={{ alignItems: "center", gap: 8 }}>
                <label style={{ fontSize: 14 }} htmlFor="tiles-per-row">
                  Nb of Tiles in a row:
                </label>
                <input
                  id="tiles-per-row"
                  type="number"
                  min={1}
                  max={12}
                  value={tilesPerRow}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isNaN(n) && n >= 1 && n <= 12) onTilesPerRowChange(n);
                  }}
                  style={{ width: 56, padding: "6px 8px" }}
                />
              </div>
            </div>
          </div>

          <div
            className={`storyboard-tiles-grid ${presentationMode ? "storyboard-tiles-grid--presentation" : ""}`}
            style={{ gridTemplateColumns: `repeat(${tilesPerRow}, 1fr)` }}
          >
            {tiles.length === 0 && <div className="status">No tiles yet.</div>}
            {presentationMode
              ? tiles.map((tile) => {
                  const tileSrc = tile.image ? imageSrc(tile.image) : "";
                  return (
                    <div className="storyboard-tile-presentation" key={tile.id}>
                      {tileSrc ? (
                        <img
                          className="storyboard-tile-presentation-img"
                          src={tileSrc}
                          alt={tile.prompt || `Tile ${tile.tile_number}`}
                        />
                      ) : (
                        <div className="storyboard-tile-presentation-placeholder">No image</div>
                      )}
                    </div>
                  );
                })
              : tiles.map((tile, index) => {
              const tileCharacters =
                tile.character_ids && tile.character_ids.length > 0
                  ? characters.filter((ch) => tile.character_ids?.includes(ch.id))
                  : [];
              const availableCharacters = characters.filter(
                (ch) => !tile.character_ids || !tile.character_ids.includes(ch.id),
              );
              const currentPrompt = promptByTile[tile.id] ?? tile.prompt ?? "";
                  const tileSrc = tile.image ? imageSrc(tile.image) : "";
              return (
                <div className="message storyboard-tile" key={tile.id}>
                  <div className="bubble">
                    <div className="message-content">
                      <div className="sources-title">
                        Tile {tile.tile_number}{" "}
                        <span className="sources-meta">(index {index + 1})</span>
                      </div>
                      {tileSrc && (
                        <div className="image-grid">
                          <div className="image-item">
                            <img
                              className="image-preview"
                              src={tileSrc}
                              alt={`Tile ${tile.tile_number}`}
                            />
                          </div>
                        </div>
                      )}
                      <div className="edit-block" style={{ marginTop: 8 }}>
                        <textarea
                          value={currentPrompt}
                          onChange={(e) =>
                            setPromptByTile((prev) => ({
                              ...prev,
                              [tile.id]: e.target.value,
                            }))
                          }
                          onBlur={(e) => {
                            const newValue = e.target.value;
                            const original = tile.prompt ?? "";
                            if (newValue !== original) {
                              onUpdateTileInputs(tile.id, { prompt: newValue });
                            }
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="admin-link"
                        onClick={async () => {
                          const currentPrompt = promptByTile[tile.id] ?? tile.prompt ?? "";
                          if (currentPrompt !== (tile.prompt ?? "")) {
                            await onUpdateTileInputs(tile.id, { prompt: currentPrompt });
                          }
                          onGenerateTile(tile);
                        }}
                        disabled={isSaving}
                      >
                        Generate
                      </button>

                      {/* Location and character selection at the bottom of the tile box */}
                      <div style={{ marginTop: 12, borderTop: "1px solid #222836", paddingTop: 8 }}>
                        <div className="edit-actions" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <label style={{ fontSize: 12 }}>Location:</label>
                          <select
                            value={tile.location_id ?? ""}
                            onChange={(e) =>
                              onUpdateTileInputs(tile.id, {
                                location_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">No location</option>
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div
                          className="edit-actions"
                          style={{ marginTop: 8, gap: 8, alignItems: "center", flexWrap: "wrap" }}
                        >
                          <label style={{ fontSize: 12 }}>Characters:</label>
                          <select
                            value={selectedCharacterByTile[tile.id] ?? ""}
                            onChange={(e) =>
                              setSelectedCharacterByTile((prev) => ({
                                ...prev,
                                [tile.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Select character</option>
                            {availableCharacters.map((ch) => (
                              <option key={ch.id} value={ch.id}>
                                {ch.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const selectedId = selectedCharacterByTile[tile.id];
                              if (!selectedId) return;
                              const current = tile.character_ids ?? [];
                              if (current.includes(selectedId)) return;
                              onUpdateTileInputs(tile.id, {
                                character_ids: [...current, selectedId],
                              });
                            }}
                            disabled={isSaving || !selectedCharacterByTile[tile.id]}
                          >
                            Add
                          </button>
                        </div>

                        {tileCharacters.length > 0 && (
                          <div style={{ marginTop: 8, fontSize: 12 }}>
                            <div>Characters in this tile:</div>
                            <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                              {tileCharacters.map((ch) => (
                                <li key={ch.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span>{ch.name}</span>
                                  <button
                                    type="button"
                                    className="admin-link"
                                    onClick={() => {
                                      const current = tile.character_ids ?? [];
                                      onUpdateTileInputs(tile.id, {
                                        character_ids: current.filter((id) => id !== ch.id),
                                      });
                                    }}
                                    disabled={isSaving}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="edit-actions">
                      <button
                        type="button"
                        onClick={() => void onReorderTiles(index, Math.max(0, index - 1))}
                        disabled={isSaving || index === 0}
                        title="Move tile left"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onReorderTiles(index, Math.min(tiles.length - 1, index + 1))
                        }
                        disabled={isSaving || index === tiles.length - 1}
                        title="Move tile right"
                      >
                        →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {!presentationMode && (
            <div
              style={{
                marginTop: 16,
                paddingTop: 8,
                borderTop: "1px solid #222836",
                display: "flex",
                justifyContent: "flex-start",
              }}
            >
              <button type="button" onClick={() => void onAddTile()} disabled={isSaving}>
                Add New Tile
              </button>
            </div>
          )}
        </div>
      )}
      <div className="status">
        {isSaving ? "Saving..." : status || ""}
      </div>
    </div>
  );
}

