"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { StudioActivityBox } from "../components/studio/StudioActivityBox";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import type { StudioActivity } from "../components/studio/types";
import { STORAGE_KEY_ACTIVE_PROJECT } from "../lib/activeProject";
import { getLocalProjectPath, isLocalAgentContext, localAgent } from "../lib/localAgentClient";
import {
  fetchAudiobankCategories,
  fetchAudiobankClipAudioBlob,
  fetchAudiobankClips,
  importAudiobankFile,
  AudiobankImportSkippedError,
  patchAudiobankClip,
  deleteAudiobankClip,
  downloadAudiobankClipFile,
  type AudiobankClip,
} from "./audiobankClient";
import { AudiobankBrowser } from "./components/AudiobankBrowser";
import { AudiobankLeftPanel } from "./components/AudiobankLeftPanel";
import {
  arrayBufferToBase64,
  AUDIOBANK_DEST_FOLDER_KEY,
  AUDIOBANK_DEFAULT_DEST_FOLDER,
  AUDIOBANK_OVERWRITE_KEY,
  AUDIOBANK_OUTPUT_FORMAT_KEY,
  normalizeProjectRelativePath,
  projectRelativeFileExists,
  resolveUseInProjectFilename,
  buildUseInProjectRelativePath,
  isAudiobankOutputFormat,
  type AudiobankOutputFormat,
} from "./audiobankUtils";

export function AudiobankPage(): ReactElement {
  const [clips, setClips] = useState<AudiobankClip[]>([]);
  const [categories, setCategories] = useState<Array<{ category: string; clip_count: number }>>([]);
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedClip, setSelectedClip] = useState<AudiobankClip | null>(null);
  const [playingClipId, setPlayingClipId] = useState<string>("");
  const [destRelative, setDestRelative] = useState<string>("");
  const [overwrite, setOverwrite] = useState<boolean>(false);
  const [outputFormat, setOutputFormat] = useState<AudiobankOutputFormat>("original");
  const [activeProjectKey, setActiveProjectKey] = useState<string>("");
  const [projectRoot, setProjectRoot] = useState<string | null>(null);
  const [localAgentEligible, setLocalAgentEligible] = useState<boolean>(false);
  const [localAgentOk, setLocalAgentOk] = useState<boolean>(false);
  const [importing, setImporting] = useState<boolean>(false);
  const [working, setWorking] = useState<boolean>(false);
  const [deletingClipId, setDeletingClipId] = useState<string>("");
  const [downloadingClipId, setDownloadingClipId] = useState<string>("");
  const [activity, setActivity] = useState<StudioActivity>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    const [clipList, categoryList] = await Promise.all([fetchAudiobankClips(), fetchAudiobankCategories()]);
    setClips(clipList);
    setCategories(categoryList);
    setSelectedClip((prev) => {
      if (!prev) {
        return null;
      }
      return clipList.find((clip) => clip.id === prev.id) || null;
    });
  }, []);

  useEffect(() => {
    setLocalAgentEligible(isLocalAgentContext());
    const storedDest = window.localStorage.getItem(AUDIOBANK_DEST_FOLDER_KEY) || AUDIOBANK_DEFAULT_DEST_FOLDER;
    setDestRelative(normalizeProjectRelativePath(storedDest));
    const storedOverwrite = window.localStorage.getItem(AUDIOBANK_OVERWRITE_KEY);
    setOverwrite(storedOverwrite === "true");
    const storedFormat = window.localStorage.getItem(AUDIOBANK_OUTPUT_FORMAT_KEY) || "original";
    setOutputFormat(isAudiobankOutputFormat(storedFormat) ? storedFormat : "original");
    const storedProject = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
    setActiveProjectKey(storedProject);
    setProjectRoot(storedProject ? getLocalProjectPath(storedProject) : null);

    const onProjectChange = () => {
      const key = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
      setActiveProjectKey(key);
      setProjectRoot(key ? getLocalProjectPath(key) : null);
    };
    window.addEventListener("activeProjectChanged", onProjectChange);
    window.addEventListener("storage", onProjectChange);
    return () => {
      window.removeEventListener("activeProjectChanged", onProjectChange);
      window.removeEventListener("storage", onProjectChange);
    };
  }, []);

  useEffect(() => {
    if (!localAgentEligible) {
      setLocalAgentOk(false);
      return;
    }
    void localAgent.health().then(setLocalAgentOk).catch(() => setLocalAgentOk(false));
  }, [localAgentEligible]);

  useEffect(() => {
    void refreshLibrary().catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Failed to load library: ${message}`, isError: true });
    });
  }, [refreshLibrary]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const stopPlayback = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setPlayingClipId("");
  };

  const handleTogglePlay = (clip: AudiobankClip) => {
    if (playingClipId === clip.id) {
      stopPlayback();
      return;
    }
    stopPlayback();
    setPlayingClipId(clip.id);
    void (async () => {
      try {
        const blob = await fetchAudiobankClipAudioBlob(clip.id);
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          stopPlayback();
        };
        await audio.play();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setActivity({ message: `Playback failed: ${message}`, isError: true });
        stopPlayback();
      }
    })();
  };

  const handleImportFiles = async (files: File[]) => {
    setImporting(true);
    setWorking(true);
    let imported = 0;
    let skipped = 0;
    const skippedNames: string[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setActivity({
          message: `Importing ${i + 1}/${files.length}: ${file.name}`,
          isError: false,
        });
        try {
          await importAudiobankFile(file, { overwrite });
          imported += 1;
        } catch (err) {
          if (err instanceof AudiobankImportSkippedError) {
            skipped += 1;
            skippedNames.push(file.name);
            const warning = `Warning: ${file.name} already exists in Audiobank. Skipped.`;
            console.warn(warning);
            continue;
          }
          throw err;
        }
      }
      await refreshLibrary();
      if (imported === 0 && skipped > 0) {
        setActivity({
          message: `Skipped ${skipped} clip(s) already in Audiobank: ${skippedNames.join(", ")}`,
          isError: false,
        });
        return;
      }
      const parts: string[] = [];
      if (imported > 0) {
        parts.push(imported === 1 ? `Imported ${files[0].name}.` : `Imported ${imported} clips.`);
      }
      if (skipped > 0) {
        parts.push(`Skipped ${skipped} existing clip(s).`);
      }
      setActivity({
        message: parts.join(" "),
        isError: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Import failed: ${message}`, isError: true });
      if (imported > 0) {
        await refreshLibrary();
      }
    } finally {
      setImporting(false);
      setWorking(false);
    }
  };

  const handleTagsChange = async (clipId: string, tags: string[]) => {
    try {
      const updated = await patchAudiobankClip(clipId, { tags });
      setClips((prev) => prev.map((clip) => (clip.id === clipId ? updated : clip)));
      if (selectedClip?.id === clipId) {
        setSelectedClip(updated);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Tag update failed: ${message}`, isError: true });
    }
  };

  const handleDestRelativeChange = (value: string) => {
    setDestRelative(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUDIOBANK_DEST_FOLDER_KEY, value);
    }
  };

  const handleDeleteClip = async (clip: AudiobankClip) => {
    if (deletingClipId) {
      return;
    }
    setDeletingClipId(clip.id);
    setWorking(true);
    try {
      if (playingClipId === clip.id) {
        stopPlayback();
      }
      await deleteAudiobankClip(clip.id);
      if (selectedClip?.id === clip.id) {
        setSelectedClip(null);
      }
      await refreshLibrary();
      setActivity({ message: `Deleted ${clip.filename}.`, isError: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Delete failed: ${message}`, isError: true });
    } finally {
      setDeletingClipId("");
      setWorking(false);
    }
  };

  const handleDownloadClip = async (clip: AudiobankClip) => {
    if (downloadingClipId) {
      return;
    }
    setDownloadingClipId(clip.id);
    setWorking(true);
    try {
      await downloadAudiobankClipFile(clip);
      setActivity({ message: `Downloaded ${clip.filename}.`, isError: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Download failed: ${message}`, isError: true });
    } finally {
      setDownloadingClipId("");
      setWorking(false);
    }
  };

  const handleUseInProject = async () => {
    if (!selectedClip || !projectRoot) {
      return;
    }
    setWorking(true);
    try {
      await localAgent.approveProjectRoot(projectRoot);
      const outputFilename = resolveUseInProjectFilename(selectedClip.filename, outputFormat);
      const relativePath = buildUseInProjectRelativePath(
        destRelative,
        selectedClip.category,
        outputFilename
      );
      const exists = await projectRelativeFileExists(projectRoot, relativePath, (root, path) =>
        localAgent.projectFileExists(root, path)
      );
      if (exists && !overwrite) {
        const warning = `Warning: ${outputFilename} already exists at ${relativePath}. Skipped.`;
        console.warn(warning);
        setActivity({ message: warning, isError: false });
        return;
      }
      const blob = await fetchAudiobankClipAudioBlob(
        selectedClip.id,
        outputFormat === "original" ? undefined : outputFormat
      );
      const buffer = await blob.arrayBuffer();
      const b64 = arrayBufferToBase64(buffer);
      await localAgent.writeBinary(projectRoot, relativePath, b64);
      setActivity({
        message: exists
          ? `Overwrote ${outputFilename} at ${relativePath}`
          : `Copied ${outputFilename} to ${relativePath}`,
        isError: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Use In Project failed: ${message}`, isError: true });
    } finally {
      setWorking(false);
    }
  };

  const left = (
    <AudiobankLeftPanel
      destRelative={destRelative}
      onDestRelativeChange={handleDestRelativeChange}
      activeProjectKey={activeProjectKey}
      projectRoot={projectRoot}
      localAgentOk={localAgentOk}
      localAgentEligible={localAgentEligible}
      selectedClip={selectedClip}
      importing={importing}
      overwrite={overwrite}
      onOverwriteChange={(value) => {
        setOverwrite(value);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AUDIOBANK_OVERWRITE_KEY, value ? "true" : "false");
        }
      }}
      outputFormat={outputFormat}
      onOutputFormatChange={(value) => {
        setOutputFormat(value);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(AUDIOBANK_OUTPUT_FORMAT_KEY, value);
        }
      }}
      onImportFiles={(files) => {
        void handleImportFiles(files);
      }}
      onUseInProject={() => {
        void handleUseInProject();
      }}
      onNotify={(message, isError) => {
        setActivity({ message, isError });
      }}
    />
  );

  const right = (
    <>
      <StudioActivityBox activity={activity} working={working} idleMessage="Ready." />
      <div className="imagegen-panel audiobank-right-panel">
        <h2 className="imagegen-panel-title">Library</h2>
        <div className="imagegen-panel-body audiobank-right-body">
          <AudiobankBrowser
            clips={clips}
            categories={categories}
            filterQuery={filterQuery}
            selectedCategory={selectedCategory}
            selectedClipId={selectedClip?.id || ""}
            playingClipId={playingClipId}
            onFilterChange={setFilterQuery}
            onCategorySelect={setSelectedCategory}
            onClipSelect={setSelectedClip}
            onTogglePlay={handleTogglePlay}
            onTagsChange={(clipId, tags) => {
              void handleTagsChange(clipId, tags);
            }}
            onDelete={(clip) => {
              void handleDeleteClip(clip);
            }}
            deletingClipId={deletingClipId}
            showDownload={!localAgentEligible || !localAgentOk}
            onDownload={(clip) => {
              void handleDownloadClip(clip);
            }}
            downloadingClipId={downloadingClipId}
          />
        </div>
      </div>
    </>
  );

  return <StudioTwoColumnShell left={left} right={right} />;
}
