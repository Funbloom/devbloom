"use client";

import { useEffect, useState } from "react";

import type { Character, Location, Storyboard, StoryboardDetailResponse, Style, Tile } from "./types";
import { StoryboardSidebar } from "./StoryboardSidebar";
import { TilesPanel } from "./TilesPanel";

const API_BASE = process.env.NEXT_PUBLIC_API_URL_BASE || "http://localhost:8000";
const STORAGE_KEY_PROJECT = "activeProjectKey";
const STORAGE_KEY_STORYBOARD = "storyboardSelectedId";

function getStoredStoryboardId(): string | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(STORAGE_KEY_STORYBOARD);
  return id?.trim() || null;
}

export default function StoryboardPage() {
  const [projectKey, setProjectKey] = useState("");
  const [storyboards, setStoryboards] = useState<Storyboard[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => getStoredStoryboardId());
  const [characters, setCharacters] = useState<Character[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [newName, setNewName] = useState("");
  const [newStyle, setNewStyle] = useState("");
  const [styles, setStyles] = useState<Style[]>([]);

  const [newCharacterName, setNewCharacterName] = useState("");
  const [newCharacterImage, setNewCharacterImage] = useState("");
  const [newCharacterFile, setNewCharacterFile] = useState<File | null>(null);

  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationImage, setNewLocationImage] = useState("");
  const [newLocationFile, setNewLocationFile] = useState<File | null>(null);

  const [newTilePrompt, setNewTilePrompt] = useState("");
  const [newTileImage, setNewTileImage] = useState("");

  const [editingTileId, setEditingTileId] = useState<string | null>(null);
  const [editingTilePrompt, setEditingTilePrompt] = useState("");
  const [generatingTileId, setGeneratingTileId] = useState<string | null>(null);
  const [tilesPerRow, setTilesPerRow] = useState(3);

  const activeStoryboard = storyboards.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    const key = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
    setProjectKey(key?.trim() ?? "");
  }, []);

  const loadStoryboards = async () => {
    setIsLoading(true);
    setStatus(null);
    try {
      const storedProjectKey = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY_PROJECT) : null;
      const url =
        storedProjectKey && storedProjectKey.trim() !== ""
          ? `${API_BASE}/storyboard?project_key=${encodeURIComponent(storedProjectKey)}`
          : `${API_BASE}/storyboard`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as Storyboard[];
      setStoryboards(data);
      if (data.length > 0) {
        const storedId = getStoredStoryboardId();
        const exists = storedId && data.some((s) => s.id === storedId);
        setSelectedId(exists ? storedId : data[0].id);
      } else {
        setSelectedId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error loading storyboards: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStoryboardDetail = async (id: string) => {
    if (!id) return;
    setIsLoading(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/${id}`);
      if (!response.ok) {
        throw new Error(`Load failed: ${response.status}`);
      }
      const data = (await response.json()) as StoryboardDetailResponse;
      setCharacters(data.characters ?? []);
      setLocations(data.locations ?? []);
      const sortedTiles = [...(data.tiles ?? [])].sort((a, b) => a.tile_number - b.tile_number);
      setTiles(sortedTiles);
      setNewStyle(data.storyboard.style ?? "");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error loading storyboard: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStyles = async () => {
    try {
      const response = await fetch(`${API_BASE}/storyboard/styles`);
      if (response.ok) {
        const data = (await response.json()) as Style[];
        setStyles(Array.isArray(data) ? data : []);
      }
    } catch {
      setStyles([]);
    }
  };

  useEffect(() => {
    void loadStoryboards();
    void loadStyles();
  }, []);

  useEffect(() => {
    if (selectedId) {
      window.localStorage.setItem(STORAGE_KEY_STORYBOARD, selectedId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY_STORYBOARD);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      void loadStoryboardDetail(selectedId);
    } else {
      setCharacters([]);
      setLocations([]);
      setTiles([]);
    }
  }, [selectedId]);

  const createStoryboard = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const storedProjectKey = typeof window !== "undefined" ? window.localStorage.getItem("activeProjectKey") : null;
      const payload = {
        name: trimmed,
        style: newStyle.trim() || undefined,
        project_key: storedProjectKey || undefined,
      };
      const response = await fetch(`${API_BASE}/storyboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Create failed: ${response.status}`);
      }
      const created = (await response.json()) as Storyboard;
      setStoryboards((prev) => [...prev, created]);
      setSelectedId(created.id);
      setNewName("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error creating storyboard: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCurrentStoryboard = async () => {
    if (!selectedId) return;
    if (!window.confirm("Delete this storyboard and all its characters and tiles?")) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Delete failed: ${response.status}`);
      }
      setStoryboards((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setCharacters([]);
      setTiles([]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error deleting storyboard: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const saveStyle = async () => {
    if (!selectedId) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const payload = { style: newStyle };
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Update failed: ${response.status}`);
      }
      const updated = (await response.json()) as Storyboard;
      setStoryboards((prev) => prev.map((s) => (s.id === updated.id ? { ...s, style: updated.style } : s)));
      setStatus("Style updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error updating style: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const applyStyle = async (style: Style | null) => {
    if (!selectedId) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const payload = { style: style ? style.prompt : "" };
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Update failed: ${response.status}`);
      }
      const updated = (await response.json()) as Storyboard;
      setStoryboards((prev) => prev.map((s) => (s.id === updated.id ? { ...s, style: updated.style } : s)));
      setNewStyle(style ? style.prompt : "");
      setStatus(style ? "Style applied." : "Style cleared.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error applying style: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addCharacterClick = async () => {
    if (!selectedId) return;
    const name = newCharacterName.trim();
    if (!name) return;
    setIsSaving(true);
    setStatus(null);
    try {
      let imageUrl: string | undefined;
      if (newCharacterFile) {
        const formData = new FormData();
        formData.append("file", newCharacterFile);
        const uploadResponse = await fetch(`${API_BASE}/storyboard/${selectedId}/characters/image`, {
          method: "POST",
          body: formData,
        });
        if (!uploadResponse.ok) {
          const body = await uploadResponse.json().catch(() => ({}));
          throw new Error((body as { detail?: string }).detail ?? `Image upload failed: ${uploadResponse.status}`);
        }
        const uploaded = (await uploadResponse.json()) as { url?: string };
        if (uploaded.url) {
          imageUrl = uploaded.url;
        }
      } else if (newCharacterImage.trim()) {
        imageUrl = newCharacterImage.trim();
      }

      const payload = { name, image: imageUrl };
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Create failed: ${response.status}`);
      }
      const created = (await response.json()) as Character;
      setCharacters((prev) => [...prev, created]);
      setNewCharacterName("");
      setNewCharacterImage("");
      setNewCharacterFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error adding character: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addLocationClick = async () => {
    if (!selectedId) return;
    const name = newLocationName.trim();
    if (!name) return;
    setIsSaving(true);
    setStatus(null);
    try {
      let imageUrl: string | undefined;
      if (newLocationFile) {
        const formData = new FormData();
        formData.append("file", newLocationFile);
        const uploadResponse = await fetch(`${API_BASE}/storyboard/${selectedId}/locations/image`, {
          method: "POST",
          body: formData,
        });
        if (!uploadResponse.ok) {
          const body = await uploadResponse.json().catch(() => ({}));
          throw new Error((body as { detail?: string }).detail ?? `Image upload failed: ${uploadResponse.status}`);
        }
        const uploaded = (await uploadResponse.json()) as { url?: string };
        if (uploaded.url) {
          imageUrl = uploaded.url;
        }
      } else if (newLocationImage.trim()) {
        imageUrl = newLocationImage.trim();
      }

      const payload = { name, image: imageUrl };
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Create failed: ${response.status}`);
      }
      const created = (await response.json()) as Location;
      setLocations((prev) => [...prev, created]);
      setNewLocationName("");
      setNewLocationImage("");
      setNewLocationFile(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error adding location: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteLocationClick = async (id: string) => {
    if (!window.confirm("Delete this location?")) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/locations/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Delete failed: ${response.status}`);
      }
      setLocations((prev) => prev.filter((loc) => loc.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error deleting location: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCharacterClick = async (id: string) => {
    if (!window.confirm("Delete this character?")) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/characters/${id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Delete failed: ${response.status}`);
      }
      setCharacters((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error deleting character: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const addTileClick = async () => {
    if (!selectedId) return;
    const prompt = "New tile";
    setIsSaving(true);
    setStatus(null);
    try {
      const payload = { prompt };
      const response = await fetch(`${API_BASE}/storyboard/${selectedId}/tiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Create failed: ${response.status}`);
      }
      const created = (await response.json()) as Tile;
      setTiles((prev) => [...prev, created].sort((a, b) => a.tile_number - b.tile_number));
      setNewTilePrompt("");
      setNewTileImage("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error adding tile: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const startEditTile = (tile: Tile) => {
    setEditingTileId(tile.id);
    setEditingTilePrompt(tile.prompt);
  };

  const cancelEditTile = () => {
    setEditingTileId(null);
    setEditingTilePrompt("");
  };

  const saveTileEdit = async (tile: Tile) => {
    if (!editingTileId) return;
    const newPrompt = editingTilePrompt.trim();
    if (!newPrompt) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const payload = { prompt: newPrompt };
      const response = await fetch(`${API_BASE}/storyboard/tiles/${tile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Update failed: ${response.status}`);
      }
      const updated = (await response.json()) as Tile;
      setTiles((prev) => prev.map((t) => (t.id === updated.id ? { ...t, prompt: updated.prompt } : t)));
      setEditingTileId(null);
      setEditingTilePrompt("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error updating tile: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const generateTile = async (tile: Tile) => {
    setGeneratingTileId(tile.id);
    setIsSaving(true);
    setStatus("Generating tile image...");
    try {
      const response = await fetch(`${API_BASE}/storyboard/tiles/${tile.id}/generate`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Generate failed: ${response.status}`);
      }
      const data = (await response.json()) as { tile?: Tile };
      const updated = (data.tile ?? null) as Tile | null;
      if (updated) {
        setTiles((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      }
      setStatus("Tile image generated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error generating tile: ${message}`);
    } finally {
      setIsSaving(false);
      setGeneratingTileId(null);
    }
  };

  const reorderTilesLocallyAndPersist = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setIsSaving(true);
    setStatus(null);
    try {
      // Use current display order (tiles array), not sort by tile_number, so indices match the UI.
      const current = [...tiles];
      const [moved] = current.splice(fromIndex, 1);
      current.splice(toIndex, 0, moved);
      const ids = current.map((t) => t.id);
      const response = await fetch(`${API_BASE}/storyboard/${moved.storyboard_id}/tiles/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tile_ids: ids }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Reorder failed: ${response.status}`);
      }
      // Keep in-memory tile_number in sync with new order so any future sort stays correct.
      setTiles(current.map((t, i) => ({ ...t, tile_number: i + 1 })));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error reordering tiles: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const updateTileInputs = async (
    tileId: string,
    updates: { prompt?: string; location_id?: string | null; character_ids?: string[] | null },
  ) => {
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/tiles/${tileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Update failed: ${response.status}`);
      }
      const updated = (await response.json()) as Tile;
      setTiles((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error updating tile: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTileClick = async (tileId: string) => {
    if (!window.confirm("Delete this tile?")) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`${API_BASE}/storyboard/tiles/${tileId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { detail?: string }).detail ?? `Delete failed: ${response.status}`);
      }
      setTiles((prev) => prev.filter((t) => t.id !== tileId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setStatus(`Error deleting tile: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main>
      <div className="chat-shell">
        <div className="chat-main">
          <StoryboardSidebar
            storyboards={storyboards}
            selectedId={selectedId}
            isLoading={isLoading}
            isSaving={isSaving}
            activeStoryboard={activeStoryboard}
            characters={characters}
            locations={locations}
            newName={newName}
            onNewNameChange={setNewName}
            onCreateStoryboard={createStoryboard}
            onDeleteStoryboard={deleteCurrentStoryboard}
            onSelectStoryboard={setSelectedId}
            styles={styles}
            newStyle={newStyle}
            onApplyStyle={applyStyle}
            projectKey={projectKey}
            newCharacterName={newCharacterName}
            newCharacterImage={newCharacterImage}
            onNewCharacterNameChange={setNewCharacterName}
            onNewCharacterImageChange={setNewCharacterImage}
            onNewCharacterFileChange={setNewCharacterFile}
            onAddCharacter={addCharacterClick}
            onDeleteCharacter={deleteCharacterClick}
            newLocationName={newLocationName}
            newLocationImage={newLocationImage}
            onNewLocationNameChange={setNewLocationName}
            onNewLocationImageChange={setNewLocationImage}
            onNewLocationFileChange={setNewLocationFile}
            onAddLocation={addLocationClick}
            onDeleteLocation={deleteLocationClick}
          />

          <TilesPanel
            storyboard={activeStoryboard}
            tiles={tiles}
            characters={characters}
            locations={locations}
            isSaving={isSaving}
            generatingTileId={generatingTileId}
            tilesPerRow={tilesPerRow}
            onTilesPerRowChange={setTilesPerRow}
            status={status}
            newTilePrompt={newTilePrompt}
            newTileImage={newTileImage}
            onNewTilePromptChange={setNewTilePrompt}
            onNewTileImageChange={setNewTileImage}
            onAddTile={addTileClick}
            editingTileId={editingTileId}
            editingTilePrompt={editingTilePrompt}
            onEditTileStart={startEditTile}
            onCancelEditTile={cancelEditTile}
            onSaveTileEdit={saveTileEdit}
            onReorderTiles={reorderTilesLocallyAndPersist}
            onGenerateTile={generateTile}
            onUpdateTileInputs={updateTileInputs}
            onDeleteTile={deleteTileClick}
          />
        </div>
      </div>
    </main>
  );
}

