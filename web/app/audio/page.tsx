"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { StudioActivityBox } from "../components/studio/StudioActivityBox";
import { StudioTwoColumnShell } from "../components/studio/StudioTwoColumnShell";
import type { StudioActivity } from "../components/studio/types";
import {
  blobToRawBase64,
  fetchInworldVoices,
  synthesizeInworldMp3,
  type InworldVoiceOption,
} from "./client";
import { isLocalAgentContext, localAgent } from "../lib/localAgentClient";
import {
  applyMoodSteering,
  moodAsDeliveryMode,
  parseNarrationBatchJson,
  resolveVoiceIdByName,
  type NarrationBatchClip,
} from "./voiceBatch";
import { readVoiceGenOutputDir, writeVoiceGenOutputDir } from "./voiceGenOutputDir";

type TtsModelOption = { id: string; label: string };

type LeftPaneTab = "single" | "batch";

type OutputMp3Preview = {
  name: string;
  url: string;
};

function isMp3FileName(name: string): boolean {
  return name.toLowerCase().endsWith(".mp3");
}

const TTS_MODEL_OPTIONS: TtsModelOption[] = [
  { id: "inworld-tts-2", label: "inworld-tts-2 (default)" },
  { id: "inworld-tts-1.5-max", label: "inworld-tts-1.5-max (low latency)" },
  { id: "inworld-tts-1.5-mini", label: "inworld-tts-1.5-mini (smallest)" },
];

const DELIVERY_MODES = ["STABLE", "BALANCED", "CREATIVE"] as const;

function slugForFilename(text: string, maxLen: number): string {
  const cleaned: string = text
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : "clip";
}

export default function VoiceGenPage(): ReactElement {
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  const [leftTab, setLeftTab] = useState<LeftPaneTab>("single");
  const [scriptText, setScriptText] = useState<string>("");
  const [voiceOptions, setVoiceOptions] = useState<InworldVoiceOption[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState<boolean>(true);
  const [voiceId, setVoiceId] = useState<string>("");
  const [modelId, setModelId] = useState<string>(TTS_MODEL_OPTIONS[0].id);
  const [deliveryMode, setDeliveryMode] = useState<string>("BALANCED");
  const [working, setWorking] = useState<boolean>(false);
  const [activity, setActivity] = useState<StudioActivity>(null);
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);

  const [batchJsonName, setBatchJsonName] = useState<string>("");
  const [batchParseError, setBatchParseError] = useState<string | null>(null);
  const [batchClips, setBatchClips] = useState<NarrationBatchClip[]>([]);

  const [eligibleLocalAgent, setEligibleLocalAgent] = useState<boolean>(false);
  const [localAgentOk, setLocalAgentOk] = useState<boolean>(false);
  const [outputDir, setOutputDir] = useState<string>(() => readVoiceGenOutputDir());
  const [outputMp3s, setOutputMp3s] = useState<OutputMp3Preview[]>([]);
  const [outputMp3sLoading, setOutputMp3sLoading] = useState<boolean>(false);
  const outputMp3UrlsRef = useRef<string[]>([]);

  const revokeOutputMp3Urls = useCallback((): void => {
    for (const url of outputMp3UrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    outputMp3UrlsRef.current = [];
  }, []);

  const replaceOutputMp3s = useCallback(
    (next: OutputMp3Preview[]): void => {
      revokeOutputMp3Urls();
      outputMp3UrlsRef.current = next.map((item) => item.url);
      setOutputMp3s(next);
    },
    [revokeOutputMp3Urls]
  );

  const refreshOutputDirMp3s = useCallback(async (): Promise<void> => {
    const root: string = outputDir.trim();
    if (!root || !eligibleLocalAgent || !localAgentOk) {
      replaceOutputMp3s([]);
      return;
    }
    setOutputMp3sLoading(true);
    try {
      await localAgent.approveProjectRoot(root);
      const listing = await localAgent.listDir(root, ".");
      const entries = listing.entries
        .filter((entry) => entry.is_file && isMp3FileName(entry.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      const next: OutputMp3Preview[] = [];
      for (const entry of entries) {
        try {
          const blob: Blob = await localAgent.readBinary(root, entry.name);
          const url: string = URL.createObjectURL(blob);
          next.push({ name: entry.name, url });
        } catch {
          // skip files that fail to read
        }
      }
      replaceOutputMp3s(next);
    } catch {
      replaceOutputMp3s([]);
    } finally {
      setOutputMp3sLoading(false);
    }
  }, [outputDir, eligibleLocalAgent, localAgentOk, replaceOutputMp3s]);

  useEffect(() => {
    setEligibleLocalAgent(isLocalAgentContext());
  }, []);

  useEffect(() => {
    if (!eligibleLocalAgent) {
      return;
    }
    let cancelled = false;
    void localAgent.health().then((ok) => {
      if (!cancelled) {
        setLocalAgentOk(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eligibleLocalAgent]);

  useEffect(() => {
    if (!eligibleLocalAgent || !localAgentOk) {
      return;
    }
    const path: string = outputDir.trim();
    if (!path) {
      return;
    }
    void localAgent.approveProjectRoot(path).catch(() => {
      // path may have moved; user can pick again
    });
  }, [eligibleLocalAgent, localAgentOk, outputDir]);

  useEffect(() => {
    void refreshOutputDirMp3s();
  }, [refreshOutputDirMp3s]);

  useEffect(() => {
    return (): void => {
      revokeOutputMp3Urls();
    };
  }, [revokeOutputMp3Urls]);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    setVoicesError(null);
    void fetchInworldVoices()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setVoiceOptions(list);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message: string = err instanceof Error ? err.message : String(err);
        setVoicesError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setVoicesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (voiceOptions.length === 0) {
      return;
    }
    setVoiceId((current) => {
      if (current && voiceOptions.some((optionItem) => optionItem.voiceId === current)) {
        return current;
      }
      return voiceOptions[0].voiceId;
    });
  }, [voiceOptions]);

  useEffect(() => {
    return (): void => {
      if (audioBlobUrl) {
        URL.revokeObjectURL(audioBlobUrl);
      }
    };
  }, [audioBlobUrl]);

  async function handlePickOutputFolder(): Promise<void> {
    if (!eligibleLocalAgent) {
      setActivity({ message: "Output folder selection needs localhost + local agent.", isError: true });
      return;
    }
    if (!localAgentOk) {
      setActivity({ message: "Start the local agent to pick a folder.", isError: true });
      return;
    }
    try {
      const picked = await localAgent.pickDirectory();
      if (picked.cancelled) {
        return;
      }
      const path = picked.path.trim();
      setOutputDir(path);
      writeVoiceGenOutputDir(path);
      await localAgent.approveProjectRoot(path);
      setActivity({ message: `Output folder set:\n${path}`, isError: false });
    } catch (err) {
      const message: string = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Folder pick failed: ${message}`, isError: true });
    }
  }

  async function handleGenerateSingle(): Promise<void> {
    if (!voiceId.trim()) {
      setActivity({ message: "Select a voice (load the list from your Inworld workspace).", isError: true });
      return;
    }
    setWorking(true);
    setActivity({
      message: "Synthesizing speech via Inworld (MP3)…",
      isError: false,
    });
    try {
      const blob: Blob = await synthesizeInworldMp3({
        text: scriptText,
        voiceId,
        modelId,
        deliveryMode: modelId === "inworld-tts-2" ? deliveryMode : undefined,
      });
      const savesToFolder: boolean = Boolean(outputDir.trim() && eligibleLocalAgent && localAgentOk);
      if (!savesToFolder) {
        setAudioBlobUrl((previous) => {
          if (previous) {
            URL.revokeObjectURL(previous);
          }
          return URL.createObjectURL(blob);
        });
      }
      let msg = savesToFolder ? "MP3 saved to output folder." : "MP3 ready — use the preview player.";
      if (savesToFolder) {
        const stamp: string = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const safeName = `voice_gen_${stamp}.mp3`;
        const root = outputDir.trim();
        await localAgent.approveProjectRoot(root);
        const b64 = await blobToRawBase64(blob);
        await localAgent.writeBinary(root, safeName, b64);
        await refreshOutputDirMp3s();
        msg += `\n${root}/${safeName}`;
      }
      setActivity({
        message: msg,
        isError: false,
      });
    } catch (err) {
      const message: string = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Error: ${message}`, isError: true });
    } finally {
      setWorking(false);
    }
  }

  async function handleBatchJsonPicked(files: FileList | null): Promise<void> {
    setBatchParseError(null);
    setBatchClips([]);
    setBatchJsonName("");
    const file = files?.[0];
    if (!file) {
      return;
    }
    setBatchJsonName(file.name);
    try {
      const text: string = await file.text();
      const clips: NarrationBatchClip[] = parseNarrationBatchJson(text);
      setBatchClips(clips);
      setActivity({
        message: `Loaded ${clips.length} clip(s) from ${file.name}.`,
        isError: false,
      });
    } catch (err) {
      const message: string = err instanceof Error ? err.message : String(err);
      setBatchParseError(message);
      setActivity({ message: `Batch JSON: ${message}`, isError: true });
    }
  }

  async function handleGenerateBatch(): Promise<void> {
    if (batchClips.length === 0) {
      setActivity({ message: "Pick a valid JSON batch file first.", isError: true });
      return;
    }
    if (voiceOptions.length === 0) {
      setActivity({ message: "No Inworld voices loaded — cannot resolve voice_name in JSON.", isError: true });
      return;
    }
    if (!outputDir.trim()) {
      setActivity({ message: "Batch generation requires an output folder. Choose output folder.", isError: true });
      return;
    }
    if (!eligibleLocalAgent || !localAgentOk) {
      setActivity({
        message: "Batch saves MP3 files on disk via the local agent — run on localhost with the agent up.",
        isError: true,
      });
      return;
    }

    setWorking(true);
    const errors: string[] = [];
    const root = outputDir.trim();

    try {
      await localAgent.approveProjectRoot(root);

      for (let index = 0; index < batchClips.length; index++) {
        const clip = batchClips[index];
        const resolved = resolveVoiceIdByName(clip.voice_name, voiceOptions);
        if (!resolved) {
          errors.push(`Clip "${clip.id}": no voice match for "${clip.voice_name}".`);
          continue;
        }
        const deliveryFromMood: string | undefined = moodAsDeliveryMode(clip.mood);
        const synthText: string = applyMoodSteering(clip.script_text, clip.mood, modelId);
        const synthDelivery =
          modelId === "inworld-tts-2"
            ? deliveryFromMood ?? "BALANCED"
            : undefined;

        setActivity({
          message: `Batch: ${clip.id} (${clip.character_name}) — synthesizing clip ${index + 1}/${batchClips.length} (${resolved})…`,
          isError: false,
        });

        try {
          const blob = await synthesizeInworldMp3({
            text: synthText,
            voiceId: resolved,
            modelId,
            deliveryMode: synthDelivery,
          });
          const idSlug = slugForFilename(clip.id, 40);
          const charSlug = slugForFilename(clip.character_name, 24);
          const voiceSlug = slugForFilename(resolved, 20);
          const fileName = `batch_${idSlug}_${charSlug}_${voiceSlug}.mp3`;
          const b64 = await blobToRawBase64(blob);
          await localAgent.writeBinary(root, fileName, b64);
        } catch (oneErr) {
          const detail: string = oneErr instanceof Error ? oneErr.message : String(oneErr);
          errors.push(`Clip "${clip.id}" (${clip.character_name}): ${detail}`);
        }
      }

      const okCount = batchClips.length - errors.length;
      const summary =
        errors.length === 0
          ? `Batch finished: wrote ${okCount} MP3 file(s) to:\n${root}`
          : `Batch partial: ${okCount} succeeded, ${errors.length} failed.\n\n${errors.join("\n")}`;

      setActivity({
        message: summary,
        isError: errors.length > 0,
      });

      await refreshOutputDirMp3s();
    } catch (err) {
      const message: string = err instanceof Error ? err.message : String(err);
      setActivity({ message: `Batch error: ${message}`, isError: true });
    } finally {
      setWorking(false);
    }
  }

  function idleHint(): string {
    if (leftTab === "batch") {
      return "Batch: pick JSON (id, character_name, voice_name, script_text, mood), set output folder, Generate all.";
    }
    return "Ready — load voices, optionally pick an output folder, enter script, Generate.";
  }

  const leftPanel: ReactElement = (
    <div className="imagegen-panel">
      <h2 className="imagegen-panel-title">Voice Gen</h2>
      <div className="imagegen-panel-body">
        <p style={{ margin: "0 0 0.75rem", fontSize: 13, color: "#9aa3b2", lineHeight: 1.45 }}>
          Inworld{' '}
          <a href="https://docs.inworld.ai/api-reference/introduction" rel="noopener noreferrer" target="_blank">
            Text-to-Speech
          </a>
          {' '}
          — MP3 synthesis. Put your Basic token in the Python API env as{' '}
          <strong>INWORLD_API_KEY</strong>{' '}
          (never in browser code — see{' '}
          <a href="https://docs.inworld.ai/api-reference/introduction" rel="noopener noreferrer" target="_blank">
            Inworld authentication
          </a>
          ).
        </p>

        {voicesError ? (
          <p style={{ margin: "0 0 0.75rem", fontSize: 12, color: "#f87171", whiteSpace: "pre-wrap" }}>
            Voices: {voicesError}
          </p>
        ) : null}
        {voicesLoading ? (
          <p style={{ margin: "0 0 0.75rem", fontSize: 12, color: "#94a3b8" }}>
            Loading voices from Inworld…
          </p>
        ) : null}

        <div className="sidebar-tabs" role="tablist" aria-label="Voice Gen mode">
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === "single"}
            className={leftTab === "single" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => {
              setLeftTab("single");
            }}
          >
            Single
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={leftTab === "batch"}
            className={leftTab === "batch" ? "sidebar-tab active" : "sidebar-tab"}
            onClick={() => {
              setLeftTab("batch");
            }}
          >
            Batch
          </button>
        </div>

        <div className="sidebar-tab-content" style={{ marginTop: "0.75rem" }}>
          <label className="imagegen-label" htmlFor="voice-gen-model" style={{ display: "block", marginBottom: 6 }}>
            Model
          </label>
          <select
            id="voice-gen-model"
            className="imagegen-select"
            style={{ width: "100%", marginBottom: "0.75rem" }}
            disabled={working}
            value={modelId}
            onChange={(event) => {
              setModelId(event.target.value);
            }}
          >
            {TTS_MODEL_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {leftTab === "single" ? (
            <>
              <label className="imagegen-label" htmlFor="voice-gen-voice" style={{ display: "block", marginBottom: 6 }}>
                Voice (Inworld workspace)
              </label>
              <select
                id="voice-gen-voice"
                className="imagegen-select"
                style={{ width: "100%", marginBottom: "0.75rem" }}
                disabled={voicesLoading || voiceOptions.length === 0 || working}
                value={voiceId}
                onChange={(event) => {
                  setVoiceId(event.target.value);
                }}
              >
                {!voicesLoading && voiceOptions.length === 0 ? (
                  <option value="">No voices loaded</option>
                ) : null}
                {voiceOptions.map((option) => (
                  <option key={option.voiceId} value={option.voiceId}>
                    {option.label}
                  </option>
                ))}
              </select>

              {modelId === "inworld-tts-2" ? (
                <>
                  <label className="imagegen-label" htmlFor="voice-gen-delivery" style={{ display: "block", marginBottom: 6 }}>
                    Delivery mode (TTS-2 only)
                  </label>
                  <select
                    id="voice-gen-delivery"
                    className="imagegen-select"
                    style={{ width: "100%", marginBottom: "0.75rem" }}
                    disabled={working}
                    value={deliveryMode}
                    onChange={(event) => {
                      setDeliveryMode(event.target.value);
                    }}
                  >
                    {DELIVERY_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              <label className="imagegen-label" htmlFor="voice-gen-script" style={{ display: "block", marginBottom: 6 }}>
                Script
              </label>
              <textarea
                id="voice-gen-script"
                value={scriptText}
                onChange={(event) => {
                  setScriptText(event.target.value);
                }}
                rows={10}
                placeholder="Text to synthesize (max 2000 chars for Inworld REST)..."
                disabled={working}
                style={{
                  width: "100%",
                  resize: "vertical",
                  padding: "8px 10px",
                  fontSize: 14,
                  marginBottom: "0.75rem",
                }}
              />
            </>
          ) : batchParseError ? (
            <p style={{ margin: "0 0 0.75rem", fontSize: 12, color: "#f87171", whiteSpace: "pre-wrap" }}>
              {batchParseError}
            </p>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "0.75rem" }}>
            <button type="button" disabled={working || !eligibleLocalAgent || !localAgentOk} onClick={() => void handlePickOutputFolder()}>
              Choose output folder (local disk)
            </button>
            {outputDir.trim() ? (
              <div style={{ fontSize: 12, color: "#94a3b8", wordBreak: "break-word" }} title={outputDir}>
                Output: {outputDir.trim()}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#64748b" }}>
                {leftTab === "batch"
                  ? "Required for batch: pick a folder to write all MP3 files."
                  : "Optional: pick a folder to save MP3 after Generate (localhost + local agent)."}
              </div>
            )}
            {!eligibleLocalAgent ? (
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Folder save needs localhost tab + running local agent.
              </div>
            ) : null}
          </div>

          {leftTab === "single" ? (
            <button type="button" disabled={working || !scriptText.trim() || !voiceId.trim()} onClick={() => void handleGenerateSingle()}>
              {working ? "Working…" : "Generate MP3"}
            </button>
          ) : (
            <button
              type="button"
              disabled={working || batchClips.length === 0 || !outputDir.trim() || !eligibleLocalAgent || !localAgentOk}
              onClick={() => void handleGenerateBatch()}
            >
              {working ? "Working…" : "Generate all MP3"}
            </button>
          )}

          {leftTab === "batch" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                marginTop: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid #2a2f3a",
              }}
            >
              <input
                ref={batchFileInputRef}
                type="file"
                accept=".json,application/json"
                className="imagegen-hidden-file-input"
                aria-hidden
                tabIndex={-1}
                onChange={(event) => {
                  void handleBatchJsonPicked(event.target.files).finally(() => {
                    if (event.target) {
                      event.target.value = "";
                    }
                  });
                }}
              />
              <button
                type="button"
                disabled={working}
                onClick={() => {
                  batchFileInputRef.current?.click();
                }}
              >
                Pick JSON batch file…
              </button>
              {batchJsonName ? (
                <span style={{ fontSize: 12, color: "#94a3b8", wordBreak: "break-word" }} title={batchJsonName}>
                  {batchJsonName} — {batchClips.length} clip(s)
                </span>
              ) : (
                <span style={{ fontSize: 12, color: "#64748b" }}>No batch file loaded.</span>
              )}
              {batchClips.length > 0 ? (
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: "0.75rem",
                    borderTop: "1px solid #222836",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: "#94a3b8",
                      marginBottom: 6,
                    }}
                  >
                    IDs in batch
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: 18,
                      fontSize: 12,
                      color: "#94a3b8",
                      lineHeight: 1.45,
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                  >
                    {batchClips.map((clip) => (
                      <li key={clip.id}>
                        <code style={{ color: "#22d3ee" }}>{clip.id}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {leftTab === "single" && (!outputDir.trim() || !eligibleLocalAgent || !localAgentOk) ? (
            <p style={{ margin: "0.75rem 0 0", fontSize: 12, color: "#64748b" }}>
              Without an approved output folder on localhost + local agent, preview stays in-browser only until you export.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  const rightPanel: ReactElement = (
    <>
      <StudioActivityBox activity={activity} working={working} idleMessage={idleHint()} />
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div className="imagegen-panel" style={{ flex: 1, minHeight: 0 }}>
          <h2 className="imagegen-panel-title">Preview</h2>
          <div className="imagegen-panel-body" style={{ alignItems: "stretch", gap: "0.75rem" }}>
            {outputDir.trim() && eligibleLocalAgent && localAgentOk ? (
              <>
                <div style={{ fontSize: 12, color: "#94a3b8", wordBreak: "break-word" }} title={outputDir.trim()}>
                  {outputMp3sLoading
                    ? "Loading MP3s from output folder…"
                    : `${outputMp3s.length} MP3 file(s) in output folder`}
                </div>
                {outputMp3s.length === 0 && !outputMp3sLoading ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>
                    No MP3 files in this folder yet — generate to add clips.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", maxHeight: "100%" }}>
                    {outputMp3s.map((item) => (
                      <div
                        key={item.name}
                        style={{
                          border: "1px solid #2a2f3a",
                          borderRadius: 10,
                          padding: "10px 12px",
                          background: "#0f1115",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            color: "#e2e8f0",
                            marginBottom: 8,
                            wordBreak: "break-word",
                          }}
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- generated audio has no captions */}
                        <audio controls src={item.url} style={{ width: "100%" }} preload="metadata" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : audioBlobUrl ? (
              /* eslint-disable-next-line jsx-a11y/media-has-caption -- generated audio has no captions */
              <audio controls src={audioBlobUrl} style={{ width: "100%" }} />
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "#94a3b8" }}>
                No audio yet — pick an output folder to list MP3s here, or generate without a folder for in-browser preview.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );

  return <StudioTwoColumnShell left={leftPanel} right={rightPanel} />;
}
