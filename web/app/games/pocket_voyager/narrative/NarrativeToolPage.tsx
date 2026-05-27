"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, ReactElement, SetStateAction } from "react";

import { STORAGE_KEY_ACTIVE_PROJECT } from "../../../lib/activeProject";
import { getLocalProjectPath, isLocalAgentContext, localAgent } from "../../../lib/localAgentClient";
import { StudioTwoColumnShell } from "../../../components/studio/StudioTwoColumnShell";
import type { StudioActivity } from "../../../components/studio/types";
import { DialogueLineEditor } from "./components/DialogueLineEditor";
import { MissionEditor } from "./components/MissionEditor";
import { MissionList } from "./components/MissionList";
import { NarrativeEditorHeader } from "./components/NarrativeEditorHeader";
import { ImproveReviewModal } from "./components/ImproveReviewModal";
import type { ImproveProposal } from "./components/ImproveReviewPanel";
import { NarrativeLeftPanel } from "./components/NarrativeLeftPanel";
import {
  narrativeImprove,
  narrativeLineAdd,
  narrativeLineDelete,
  narrativeLineReorder,
  narrativeLineUpdate,
  narrativeMissionLines,
  narrativeMissionAdd,
  narrativeMissionDelete,
  narrativeMissionUpdate,
  narrativeValidate,
  type DialogueLineRow,
  type MissionSummary,
} from "./narrativeClient";
import {
  parseUploadedJsonFile,
  readJsonFromAbsolutePath,
  readJsonFromProject,
  relativePathFromProjectRoot,
  resolveNarrativeProjectRoot,
  writeJsonToAbsolutePath,
  writeJsonToProject,
} from "./narrativeFileIo";
import { DEFAULT_DIALOGUES_RELATIVE, DEFAULT_MISSIONS_RELATIVE } from "./narrativePaths";
import {
  readNarrativeSession,
  writeNarrativeSession,
  type NarrativeSession,
  type NarrativeSidebarTab,
} from "./narrativeSession";

function missionFromDoc(
  missionsDoc: Record<string, unknown>,
  missionId: string
): Record<string, unknown> | null {
  const list = missionsDoc.missions;
  if (!Array.isArray(list)) {
    return null;
  }
  for (const entry of list) {
    if (typeof entry === "object" && entry !== null && (entry as { id?: string }).id === missionId) {
      return JSON.parse(JSON.stringify(entry)) as Record<string, unknown>;
    }
  }
  return null;
}

function buildDefaultMission(missionsDoc: Record<string, unknown>): Record<string, unknown> {
  const list = missionsDoc.missions;
  if (Array.isArray(list) && list.length > 0) {
    const last = list[list.length - 1];
    if (typeof last === "object" && last !== null) {
      const template = JSON.parse(JSON.stringify(last)) as Record<string, unknown>;
      const suffix = Date.now().toString(36);
      template.id = `new_mission_${suffix}`;
      template.title = "New mission";
      template.dialogueLineIds = [];
      template.returnDialogueLineIds = [];
      return template;
    }
  }
  return {
    id: `new_mission_${Date.now().toString(36)}`,
    title: "New mission",
    description: "",
    category: "story",
    missionType: "travel_city_goal",
    difficulty: "easy",
    isDaily: false,
    isRepeatable: false,
    isStartingMission: false,
    dialogueLineIds: [],
    returnDialogueLineIds: [],
    unlocksMissionIds: [],
    objectives: [],
    requirements: {
      minDogLevel: 1,
      location: "",
      requiredItems: [],
      optionalItems: [],
      mustUseCorrectDestination: false,
      mustUseCorrectItems: false,
    },
    rewards: { flowers: 0, dogXp: 0, items: [], puzzleFragments: 0 },
    ui: { icon: "map", themeColor: "teal", showProgressBar: true },
    analytics: { tags: [] },
  };
}

function newLineId(missionId: string, section: "intro" | "return"): string {
  const suffix = Date.now().toString(36);
  return `${missionId}_${section}_${suffix}`.replace(/[^a-zA-Z0-9_]/g, "_");
}

function activityMsg(message: string, isError = false): StudioActivity {
  return { message, isError };
}

function clipsFromDialogues(dialogues: Record<string, unknown>): Array<Record<string, unknown>> {
  const clips = dialogues.clips;
  if (!Array.isArray(clips)) {
    return [];
  }
  return clips.filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null);
}

function lookupImprovedText(improved: Record<string, string>, clipId: string): string | undefined {
  if (Object.prototype.hasOwnProperty.call(improved, clipId)) {
    return improved[clipId];
  }
  const matchKey = Object.keys(improved).find((key) => key.toLowerCase() === clipId.toLowerCase());
  if (matchKey === undefined) {
    return undefined;
  }
  return improved[matchKey];
}

function buildImproveProposals(
  ids: string[],
  improved: Record<string, string>,
  introLines: DialogueLineRow[],
  returnLines: DialogueLineRow[],
  dialogues: Record<string, unknown>
): ImproveProposal[] {
  const rows = [...introLines, ...returnLines];
  const clips = clipsFromDialogues(dialogues);
  const proposals: ImproveProposal[] = [];
  for (const id of ids) {
    const row = rows.find((entry) => entry.id.toLowerCase() === id.toLowerCase());
    const clipId = row?.id ?? id;
    const clip = clips.find((entry) => String(entry.id ?? "").toLowerCase() === clipId.toLowerCase());
    const proposedText = lookupImprovedText(improved, clipId);
    if (proposedText === undefined) {
      continue;
    }
    const originalText = row?.script_text ?? String(clip?.script_text ?? "");
    proposals.push({ clipId, originalText, proposedText });
  }
  return proposals;
}

export default function NarrativeToolPage(): ReactElement {
  const [eligibleAgent, setEligibleAgent] = useState(false);
  const [agentOk, setAgentOk] = useState(false);
  const [projectKey, setProjectKey] = useState("");
  const [projectRoot, setProjectRoot] = useState<string | null>(null);

  const [missionsRelativePath, setMissionsRelativePath] = useState(DEFAULT_MISSIONS_RELATIVE);
  const [dialoguesRelativePath, setDialoguesRelativePath] = useState(DEFAULT_DIALOGUES_RELATIVE);
  const [missionsFilePath, setMissionsFilePath] = useState("");
  const [dialoguesFilePath, setDialoguesFilePath] = useState("");

  const [missions, setMissions] = useState<Record<string, unknown> | null>(null);
  const [dialogues, setDialogues] = useState<Record<string, unknown> | null>(null);
  const [missionSummaries, setMissionSummaries] = useState<MissionSummary[]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);

  const [activeMissionId, setActiveMissionId] = useState("");
  const [sidebarTab, setSidebarTab] = useState<NarrativeSidebarTab>("dialogues");
  const [missionDraft, setMissionDraft] = useState<Record<string, unknown> | null>(null);
  const missionOriginalIdRef = useRef("");
  const [introLines, setIntroLines] = useState<DialogueLineRow[]>([]);
  const [returnLines, setReturnLines] = useState<DialogueLineRow[]>([]);

  const [selectedIntro, setSelectedIntro] = useState<Set<string>>(new Set());
  const [selectedReturn, setSelectedReturn] = useState<Set<string>>(new Set());

  const [aiImprovePrompt, setAiImprovePrompt] = useState("");
  const [improveProposals, setImproveProposals] = useState<ImproveProposal[]>([]);
  const [improving, setImproving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [activity, setActivity] = useState<StudioActivity>(null);

  const lineIdOriginalRef = useRef<Record<string, string>>({});
  const selectedIntroRef = useRef<Set<string>>(new Set());
  const selectedReturnRef = useRef<Set<string>>(new Set());
  selectedIntroRef.current = selectedIntro;
  selectedReturnRef.current = selectedReturn;

  const fallbackMode = !eligibleAgent || !agentOk;
  const loaded = missions !== null && dialogues !== null;

  const persistSession = useCallback((): void => {
    const session: NarrativeSession = {
      projectKey,
      missionsRelativePath,
      dialoguesRelativePath,
      missionsFilePath,
      dialoguesFilePath,
      activeMissionId,
      aiImprovePrompt,
      lineTypeDefault: "intro",
      sidebarTab,
    };
    writeNarrativeSession(session);
  }, [
    projectKey,
    missionsRelativePath,
    dialoguesRelativePath,
    missionsFilePath,
    dialoguesFilePath,
    activeMissionId,
    aiImprovePrompt,
    sidebarTab,
  ]);

  useEffect(() => {
    persistSession();
  }, [persistSession]);

  useEffect(() => {
    setEligibleAgent(isLocalAgentContext());
    const saved = readNarrativeSession();
    if (saved) {
      if (saved.missionsRelativePath) {
        setMissionsRelativePath(saved.missionsRelativePath);
      }
      if (saved.dialoguesRelativePath) {
        setDialoguesRelativePath(saved.dialoguesRelativePath);
      }
      setMissionsFilePath(saved.missionsFilePath);
      setDialoguesFilePath(saved.dialoguesFilePath);
      setActiveMissionId(saved.activeMissionId);
      setAiImprovePrompt(saved.aiImprovePrompt);
      if (saved.sidebarTab) {
        setSidebarTab(saved.sidebarTab);
      }
      if (saved.projectKey) {
        setProjectKey(saved.projectKey);
      }
    }
    const key = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
    setProjectKey((prev) => prev || key);
  }, []);

  useEffect(() => {
    if (!eligibleAgent) {
      return;
    }
    let cancelled = false;
    void localAgent.health().then((ok) => {
      if (!cancelled) {
        setAgentOk(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eligibleAgent]);

  useEffect(() => {
    const key = projectKey.trim();
    setProjectRoot(key ? getLocalProjectPath(key) : null);
  }, [projectKey]);

  useEffect(() => {
    const onProject = (): void => {
      const key = window.localStorage.getItem(STORAGE_KEY_ACTIVE_PROJECT) || "";
      setProjectKey(key);
    };
    window.addEventListener("activeProjectChanged", onProject);
    window.addEventListener("storage", onProject);
    return () => {
      window.removeEventListener("activeProjectChanged", onProject);
      window.removeEventListener("storage", onProject);
    };
  }, []);

  useEffect(() => {
    if (!dirty) {
      return;
    }
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const refreshValidation = useCallback(
    async (missionsDoc: Record<string, unknown>, dialoguesDoc: Record<string, unknown>) => {
      const result = await narrativeValidate(missionsDoc, dialoguesDoc);
      setMissionSummaries(result.missions);
      setValidationErrors(result.errors);
      setOrphanCount(result.orphan_clip_ids.length);
      return result;
    },
    []
  );

  const refreshMissionLines = useCallback(
    async (
      missionsDoc: Record<string, unknown>,
      dialoguesDoc: Record<string, unknown>,
      missionId: string
    ) => {
      if (!missionId) {
        setIntroLines([]);
        setReturnLines([]);
        return;
      }
      const view = await narrativeMissionLines(missionsDoc, dialoguesDoc, missionId);
      setIntroLines(view.intro);
      setReturnLines(view.return_lines);
      for (const row of [...view.intro, ...view.return_lines]) {
        lineIdOriginalRef.current[row.id] = row.id;
      }
    },
    []
  );

  const syncMissionDraft = useCallback((missionsDoc: Record<string, unknown>, missionId: string): void => {
    if (!missionId) {
      setMissionDraft(null);
      missionOriginalIdRef.current = "";
      return;
    }
    const mission = missionFromDoc(missionsDoc, missionId);
    if (mission) {
      setMissionDraft(mission);
      missionOriginalIdRef.current = missionId;
    }
  }, []);

  useEffect(() => {
    if (sidebarTab !== "mission" || !missions || !activeMissionId) {
      return;
    }
    syncMissionDraft(missions, activeMissionId);
  }, [sidebarTab, missions, activeMissionId, syncMissionDraft]);

  const loadDocuments = useCallback(async (): Promise<void> => {
    setWorking(true);
    setActivity(activityMsg("Loading narrative files…" ));
    try {
      let missionsDoc: Record<string, unknown>;
      let dialoguesDoc: Record<string, unknown>;

      if (agentOk && projectRoot) {
        const narrativeRoot = await resolveNarrativeProjectRoot(projectRoot);
        if (narrativeRoot !== projectRoot.replace(/[/\\]+$/, "")) {
          setActivity(activityMsg(`Using Unity project folder: ${narrativeRoot}`));
        }
        missionsDoc = missionsFilePath
          ? await readJsonFromAbsolutePath(missionsFilePath)
          : await readJsonFromProject(narrativeRoot, missionsRelativePath);
        dialoguesDoc = dialoguesFilePath
          ? await readJsonFromAbsolutePath(dialoguesFilePath)
          : await readJsonFromProject(narrativeRoot, dialoguesRelativePath);
      } else if (missions && dialogues) {
        missionsDoc = missions;
        dialoguesDoc = dialogues;
      } else {
        throw new Error("Load missions and dialogues via upload, or connect the local agent.");
      }

      setMissions(missionsDoc);
      setDialogues(dialoguesDoc);
      setDirty(false);
      const validation = await refreshValidation(missionsDoc, dialoguesDoc);
      const nextMissionId =
        activeMissionId && validation.missions.some((m) => m.id === activeMissionId)
          ? activeMissionId
          : validation.missions[0]?.id ?? "";
      setActiveMissionId(nextMissionId);
      await refreshMissionLines(missionsDoc, dialoguesDoc, nextMissionId);
      setActivity(activityMsg("Loaded." ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setActivity(activityMsg(message, true));
    } finally {
      setWorking(false);
    }
  }, [
    agentOk,
    projectRoot,
    missionsFilePath,
    dialoguesFilePath,
    missionsRelativePath,
    dialoguesRelativePath,
    missions,
    dialogues,
    activeMissionId,
    refreshValidation,
    refreshMissionLines,
  ]);

  useEffect(() => {
    if (!agentOk || !projectRoot) {
      return;
    }
    void loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial auto-load when agent ready
  }, [agentOk, projectRoot]);

  const persistToDisk = useCallback(
    async (missionsDoc: Record<string, unknown>, dialoguesDoc: Record<string, unknown>): Promise<void> => {
      if (!agentOk || !projectRoot) {
        throw new Error("Auto-save needs the local agent and a Unity project path.");
      }
      const narrativeRoot = await resolveNarrativeProjectRoot(projectRoot);
      if (missionsFilePath) {
        await writeJsonToAbsolutePath(missionsFilePath, missionsDoc);
      } else {
        await writeJsonToProject(narrativeRoot, missionsRelativePath, missionsDoc);
      }
      if (dialoguesFilePath) {
        await writeJsonToAbsolutePath(dialoguesFilePath, dialoguesDoc);
      } else {
        await writeJsonToProject(narrativeRoot, dialoguesRelativePath, dialoguesDoc);
      }
    },
    [
      agentOk,
      projectRoot,
      missionsFilePath,
      dialoguesFilePath,
      missionsRelativePath,
      dialoguesRelativePath,
    ],
  );

  const applyWorkspace = useCallback(
    async (
      nextMissions: Record<string, unknown>,
      nextDialogues: Record<string, unknown>,
      missionId: string
    ) => {
      setMissions(nextMissions);
      setDialogues(nextDialogues);
      await refreshValidation(nextMissions, nextDialogues);
      await refreshMissionLines(nextMissions, nextDialogues, missionId);
      if (agentOk && projectRoot) {
        setActivity(activityMsg("Saving…"));
        try {
          await persistToDisk(nextMissions, nextDialogues);
          setDirty(false);
          setActivity(activityMsg("Saved automatically."));
        } catch (err) {
          setDirty(true);
          const message = err instanceof Error ? err.message : String(err);
          setActivity(activityMsg(message, true));
        }
      } else {
        setDirty(true);
      }
    },
    [agentOk, projectRoot, refreshValidation, refreshMissionLines, persistToDisk],
  );

  const handlePickMissions = useCallback(async (): Promise<void> => {
    if (!projectRoot) {
      setActivity(activityMsg("Set a local project path in Admin → Projects." , true));
      return;
    }
    const narrativeRoot = await resolveNarrativeProjectRoot(projectRoot);
    const pick = await localAgent.pickFile({
      title: "Select missions_story.json",
      filetypes: [["JSON", "*.json"]],
    });
    if (pick.cancelled || !pick.path) {
      return;
    }
    const rel = relativePathFromProjectRoot(narrativeRoot, pick.path);
    if (rel !== null) {
      setMissionsRelativePath(rel);
      setMissionsFilePath("");
    } else {
      setMissionsFilePath(pick.path);
    }
    setActivity(activityMsg("Missions path updated. Reload to apply." ));
  }, [projectRoot]);

  const handlePickDialogues = useCallback(async (): Promise<void> => {
    if (!projectRoot) {
      setActivity(activityMsg("Set a local project path in Admin → Projects." , true));
      return;
    }
    const narrativeRoot = await resolveNarrativeProjectRoot(projectRoot);
    const pick = await localAgent.pickFile({
      title: "Select dialogues_story.json",
      filetypes: [["JSON", "*.json"]],
    });
    if (pick.cancelled || !pick.path) {
      return;
    }
    const rel = relativePathFromProjectRoot(narrativeRoot, pick.path);
    if (rel !== null) {
      setDialoguesRelativePath(rel);
      setDialoguesFilePath("");
    } else {
      setDialoguesFilePath(pick.path);
    }
    setActivity(activityMsg("Dialogues path updated. Reload to apply." ));
  }, [projectRoot]);

  const handleUploadMissions = useCallback(
    async (file: File): Promise<void> => {
      setWorking(true);
      try {
        const doc = await parseUploadedJsonFile(file);
        setMissions(doc);
        if (missions && dialogues) {
          await refreshValidation(doc, dialogues);
        }
        if (dialogues && agentOk && projectRoot) {
          await persistToDisk(doc, dialogues);
          setDirty(false);
          setActivity(activityMsg(`Loaded and saved ${file.name} (missions).`));
        } else {
          setDirty(true);
          setActivity(activityMsg(`Loaded ${file.name} (missions).`));
        }
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, refreshValidation, agentOk, projectRoot, persistToDisk]
  );

  const handleUploadDialogues = useCallback(
    async (file: File): Promise<void> => {
      setWorking(true);
      try {
        const doc = await parseUploadedJsonFile(file);
        setDialogues(doc);
        if (missions && doc) {
          const validation = await refreshValidation(missions, doc);
          const mid = activeMissionId || validation.missions[0]?.id || "";
          setActiveMissionId(mid);
          await refreshMissionLines(missions, doc, mid);
        }
        if (missions && agentOk && projectRoot) {
          await persistToDisk(missions, doc);
          setDirty(false);
          setActivity(activityMsg(`Loaded and saved ${file.name} (dialogues).`));
        } else {
          setDirty(true);
          setActivity(activityMsg(`Loaded ${file.name} (dialogues).`));
        }
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, activeMissionId, refreshValidation, refreshMissionLines, agentOk, projectRoot, persistToDisk]
  );

  const handleSelectMission = useCallback(
    async (missionId: string): Promise<void> => {
      setActiveMissionId(missionId);
      setSelectedIntro(new Set());
      setSelectedReturn(new Set());
      if (missions) {
        syncMissionDraft(missions, missionId);
      }
      if (missions && dialogues) {
        await refreshMissionLines(missions, dialogues, missionId);
      }
    },
    [missions, dialogues, refreshMissionLines, syncMissionDraft]
  );

  const handleSaveMission = useCallback(
    async (mission: Record<string, unknown>): Promise<void> => {
      if (!missions || !dialogues) {
        return;
      }
      const originalId = missionOriginalIdRef.current || activeMissionId;
      const nextId = String(mission.id ?? "").trim();
      const newId = nextId && nextId !== originalId ? nextId : undefined;
      setWorking(true);
      try {
        const result = await narrativeMissionUpdate(missions, dialogues, originalId, mission, newId);
        const focusId = newId ?? originalId;
        missionOriginalIdRef.current = focusId;
        setActiveMissionId(focusId);
        setMissionDraft(missionFromDoc(result.missions, focusId));
        await applyWorkspace(result.missions, result.dialogues, focusId);
        setActivity(activityMsg("Mission saved."));
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, activeMissionId, applyWorkspace]
  );

  const handleAddMission = useCallback(async (): Promise<void> => {
    if (!missions || !dialogues) {
      return;
    }
    const mission = buildDefaultMission(missions);
    setWorking(true);
    try {
      const result = await narrativeMissionAdd(missions, dialogues, mission);
      const newId = String(mission.id ?? "");
      setSidebarTab("mission");
      setActiveMissionId(newId);
      missionOriginalIdRef.current = newId;
      setMissionDraft(missionFromDoc(result.missions, newId));
      await applyWorkspace(result.missions, result.dialogues, newId);
      setActivity(activityMsg(`Added mission ${newId}.`));
    } catch (err) {
      setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
    } finally {
      setWorking(false);
    }
  }, [missions, dialogues, applyWorkspace]);

  const handleDeleteMission = useCallback(async (): Promise<void> => {
    if (!missions || !dialogues || !activeMissionId) {
      return;
    }
    if (!window.confirm(`Delete mission "${activeMissionId}"? This cannot be undone.`)) {
      return;
    }
    setWorking(true);
    try {
      const result = await narrativeMissionDelete(missions, dialogues, activeMissionId);
      const validation = await refreshValidation(result.missions, result.dialogues);
      const nextId = validation.missions[0]?.id ?? "";
      setActiveMissionId(nextId);
      setMissionDraft(nextId ? missionFromDoc(result.missions, nextId) : null);
      missionOriginalIdRef.current = nextId;
      setMissions(result.missions);
      setDialogues(result.dialogues);
      await refreshMissionLines(result.missions, result.dialogues, nextId);
      if (agentOk && projectRoot) {
        await persistToDisk(result.missions, result.dialogues);
        setDirty(false);
        setActivity(activityMsg("Mission deleted."));
      } else {
        setDirty(true);
        setActivity(activityMsg("Mission deleted (not saved to disk)."));
      }
    } catch (err) {
      setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
    } finally {
      setWorking(false);
    }
  }, [
    missions,
    dialogues,
    activeMissionId,
    refreshValidation,
    refreshMissionLines,
    agentOk,
    projectRoot,
    persistToDisk,
  ]);

  const commitLineField = useCallback(
    async (_section: "intro" | "return", lineId: string, row: DialogueLineRow) => {
      if (!missions || !dialogues) {
        return;
      }
      const originalId = lineIdOriginalRef.current[lineId] ?? lineId;
      const fields: Record<string, unknown> = {
        script_text: row.script_text,
        character_name: row.character_name,
        voice_name: row.voice_name,
        mood: row.mood,
      };

      const newId = row.id.trim();
      const idChanged = newId !== originalId;

      setWorking(true);
      try {
        const result = await narrativeLineUpdate(
          missions,
          dialogues,
          originalId,
          fields,
          idChanged ? newId : undefined
        );
        if (idChanged && newId) {
          delete lineIdOriginalRef.current[lineId];
          lineIdOriginalRef.current[newId] = newId;
        }
        await applyWorkspace(result.missions, result.dialogues, activeMissionId);
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, activeMissionId, applyWorkspace]
  );

  const patchLocalLine = (
    section: "intro" | "return",
    lineId: string,
    patch: Partial<DialogueLineRow>
  ): void => {
    const updater = (rows: DialogueLineRow[]): DialogueLineRow[] =>
      rows.map((row) => (row.id === lineId ? { ...row, ...patch } : row));
    if (section === "intro") {
      setIntroLines(updater);
    } else {
      setReturnLines(updater);
    }
  };

  const handleLineChange = (
    section: "intro" | "return",
    lineId: string,
    patch: Partial<DialogueLineRow>
  ): void => {
    patchLocalLine(section, lineId, patch);
  };

  const handleLineBlur = (section: "intro" | "return", lineId: string): void => {
    const rows = section === "intro" ? introLines : returnLines;
    const row = rows.find((entry) => entry.id === lineId);
    if (!row) {
      return;
    }
    void commitLineField(section, lineId, row);
  };

  const handleDeleteLine = useCallback(
    async (lineId: string): Promise<void> => {
      if (!missions || !dialogues || !activeMissionId) {
        return;
      }
      if (!window.confirm(`Delete line "${lineId}" from dialogues and all missions?`)) {
        return;
      }
      setWorking(true);
      try {
        const result = await narrativeLineDelete(missions, dialogues, lineId);
        await applyWorkspace(result.missions, result.dialogues, activeMissionId);
        setActivity(activityMsg(`Deleted ${lineId}.`));
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, activeMissionId, applyWorkspace]
  );

  const reorderSection = useCallback(
    async (section: "intro" | "return", orderedIds: string[]): Promise<void> => {
      if (!missions || !dialogues || !activeMissionId) {
        return;
      }
      setWorking(true);
      try {
        const result = await narrativeLineReorder(missions, dialogues, activeMissionId, section, orderedIds);
        await applyWorkspace(result.missions, result.dialogues, activeMissionId);
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, activeMissionId, applyWorkspace]
  );

  const handleMove = (section: "intro" | "return", lineId: string, delta: number): void => {
    const rows = section === "intro" ? introLines : returnLines;
    const index = rows.findIndex((r) => r.id === lineId);
    if (index < 0) {
      return;
    }
    const target = index + delta;
    if (target < 0 || target >= rows.length) {
      return;
    }
    const next = [...rows];
    const tmp = next[index];
    next[index] = next[target];
    next[target] = tmp;
    const ids = next.map((r) => r.id);
    if (section === "intro") {
      setIntroLines(next);
    } else {
      setReturnLines(next);
    }
    void reorderSection(section, ids);
  };

  const handleAddLine = useCallback(
    async (section: "intro" | "return"): Promise<void> => {
      if (!missions || !dialogues || !activeMissionId) {
        return;
      }
      const id = newLineId(activeMissionId, section);
      const lastIntro = introLines[introLines.length - 1];
      const lastReturn = returnLines[returnLines.length - 1];
      const template = section === "intro" ? lastIntro : lastReturn;
      setWorking(true);
      try {
        const result = await narrativeLineAdd(missions, dialogues, activeMissionId, section, {
          id,
          character_name: template?.character_name ?? "Dog",
          voice_name: template?.voice_name ?? "Mark",
          script_text: "",
          mood: template?.mood ?? "EXCITED",
        });
        await applyWorkspace(result.missions, result.dialogues, activeMissionId);
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err) , true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, activeMissionId, introLines, returnLines, applyWorkspace]
  );

  const applyImprovedDialogues = useCallback(
    async (nextDialogues: Record<string, unknown>, acceptedCount: number): Promise<void> => {
      if (missions) {
        await applyWorkspace(missions, nextDialogues, activeMissionId);
      } else {
        setDialogues(nextDialogues);
        setDirty(true);
      }
      setActivity(
        activityMsg(
          agentOk && projectRoot
            ? `Accepted ${acceptedCount} line(s) and saved.`
            : `Accepted ${acceptedCount} line(s). Connect the local agent to save.`
        )
      );
    },
    [missions, activeMissionId, applyWorkspace, agentOk, projectRoot]
  );

  const handleImprove = useCallback(async (): Promise<void> => {
    if (!dialogues) {
      return;
    }
    const ids = [...selectedIntroRef.current, ...selectedReturnRef.current];
    if (ids.length === 0) {
      setActivity(
        activityMsg(
          "Select at least one line (checkbox or line number) in Intro or Return, then run improve.",
          true
        )
      );
      return;
    }
    setImproving(true);
    setWorking(true);
    setActivity(activityMsg("Improving selected lines…"));
    try {
      const improved = await narrativeImprove(dialogues, ids, aiImprovePrompt);
      const proposals = buildImproveProposals(ids, improved, introLines, returnLines, dialogues);
      if (proposals.length === 0) {
        setActivity(activityMsg("No improvements returned for the selected lines.", true));
        return;
      }
      setImproveProposals(proposals);
      setActivity(
        activityMsg(`Review ${proposals.length} change(s) in the popup — Accept or Decline each one.`)
      );
    } catch (err) {
      setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
    } finally {
      setImproving(false);
      setWorking(false);
    }
  }, [dialogues, aiImprovePrompt, introLines, returnLines]);

  const handleAcceptImprove = useCallback(
    async (clipId: string): Promise<void> => {
      if (!dialogues) {
        return;
      }
      const proposal = improveProposals.find((entry) => entry.clipId === clipId);
      if (!proposal) {
        return;
      }
      setWorking(true);
      try {
        let nextDialogues = dialogues;
        if (missions) {
          const result = await narrativeLineUpdate(missions, dialogues, clipId, {
            script_text: proposal.proposedText,
          });
          nextDialogues = result.dialogues;
        } else {
          const nextClips = clipsFromDialogues(dialogues).map((clip) => {
            const cid = String(clip.id ?? "");
            if (cid.toLowerCase() === clipId.toLowerCase()) {
              return { ...clip, script_text: proposal.proposedText };
            }
            return clip;
          });
          nextDialogues = { ...dialogues, clips: nextClips };
        }
        setImproveProposals((prev) => prev.filter((entry) => entry.clipId !== clipId));
        await applyImprovedDialogues(nextDialogues, 1);
      } catch (err) {
        setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
      } finally {
        setWorking(false);
      }
    },
    [missions, dialogues, improveProposals, applyImprovedDialogues]
  );

  const handleDeclineImprove = useCallback((clipId: string): void => {
    setImproveProposals((prev) => {
      const next = prev.filter((entry) => entry.clipId !== clipId);
      if (next.length === 0) {
        setActivity(activityMsg("Declined remaining changes. No changes saved."));
      }
      return next;
    });
  }, []);

  const handleAcceptAllImprove = useCallback(async (): Promise<void> => {
    if (!dialogues || improveProposals.length === 0) {
      return;
    }
    setWorking(true);
    try {
      const byId = new Map(improveProposals.map((entry) => [entry.clipId.toLowerCase(), entry.proposedText]));
      const nextClips = clipsFromDialogues(dialogues).map((clip) => {
        const cid = String(clip.id ?? "");
        const text = byId.get(cid.toLowerCase());
        if (text !== undefined) {
          return { ...clip, script_text: text };
        }
        return clip;
      });
      const nextDialogues = { ...dialogues, clips: nextClips };
      const count = improveProposals.length;
      setImproveProposals([]);
      await applyImprovedDialogues(nextDialogues, count);
    } catch (err) {
      setActivity(activityMsg(err instanceof Error ? err.message : String(err), true));
    } finally {
      setWorking(false);
    }
  }, [missions, dialogues, improveProposals, applyImprovedDialogues]);

  const handleDeclineAllImprove = useCallback((): void => {
    setImproveProposals([]);
    setActivity(activityMsg("Declined all changes. No changes saved."));
  }, []);

  const missionsPathLabel = useMemo(() => {
    if (missionsFilePath) {
      return missionsFilePath;
    }
    if (projectRoot && missionsRelativePath) {
      return `${projectRoot.replace(/[/\\]+$/, "")}/${missionsRelativePath.replace(/^\/+/, "")}`;
    }
    return "";
  }, [missionsFilePath, projectRoot, missionsRelativePath]);

  const selectedLineCount = selectedIntro.size + selectedReturn.size;

  const dialoguesPathLabel = useMemo(() => {
    if (dialoguesFilePath) {
      return dialoguesFilePath;
    }
    if (projectRoot && dialoguesRelativePath) {
      return `${projectRoot.replace(/[/\\]+$/, "")}/${dialoguesRelativePath.replace(/^\/+/, "")}`;
    }
    return "";
  }, [dialoguesFilePath, projectRoot, dialoguesRelativePath]);

  const wrapLineEditor = (
    section: "intro" | "return",
    title: string,
    lines: DialogueLineRow[],
    selected: Set<string>,
    setSelected: Dispatch<SetStateAction<Set<string>>>
  ): ReactElement => (
    <DialogueLineEditor
      section={section}
      title={title}
      lines={lines}
      selectedIds={selected}
      onToggleSelect={(id) => {
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
      }}
      onSelectAll={() => setSelected(new Set(lines.map((l) => l.id)))}
      onClearSelection={() => setSelected(new Set())}
      onLineChange={(id, patch) => handleLineChange(section, id, patch)}
      onLineBlur={(id) => void handleLineBlur(section, id)}
      onDeleteLine={handleDeleteLine}
      onMoveUp={(id) => handleMove(section, id, -1)}
      onMoveDown={(id) => handleMove(section, id, 1)}
      onAddLine={() => void handleAddLine(section)}
    />
  );

  return (
    <>
    <StudioTwoColumnShell
      left={
        <NarrativeLeftPanel
          missionsPathLabel={missionsPathLabel}
          dialoguesPathLabel={dialoguesPathLabel}
          missionsRelativePath={missionsRelativePath}
          dialoguesRelativePath={dialoguesRelativePath}
          aiImprovePrompt={aiImprovePrompt}
          dirty={dirty}
          agentAvailable={eligibleAgent && agentOk}
          fallbackMode={fallbackMode}
          working={working}
          activity={activity}
          validationErrors={validationErrors}
          orphanCount={orphanCount}
          onMissionsRelativeChange={setMissionsRelativePath}
          onDialoguesRelativeChange={setDialoguesRelativePath}
          onAiImprovePromptChange={setAiImprovePrompt}
          onPickMissions={() => void handlePickMissions()}
          onPickDialogues={() => void handlePickDialogues()}
          onLoad={() => void loadDocuments()}
          onImprove={() => void handleImprove()}
          selectedLineCount={selectedLineCount}
          autoSaveEnabled={agentOk && Boolean(projectRoot)}
          onUploadMissions={(file) => void handleUploadMissions(file)}
          onUploadDialogues={(file) => void handleUploadDialogues(file)}
        />
      }
      right={
        <div className="narrative-workspace">
          {!loaded ? (
            <p className="imagegen-left-hint">
              {fallbackMode
                ? "Upload missions and dialogues JSON, or start the local agent and set a project path."
                : "Loading…"}
            </p>
          ) : (
            <>
              <MissionList
                missions={missionSummaries}
                activeMissionId={activeMissionId}
                sidebarTab={sidebarTab}
                onSidebarTabChange={setSidebarTab}
                onSelectMission={(id) => void handleSelectMission(id)}
                onAddMission={() => void handleAddMission()}
              />
              <div className="narrative-main imagegen-panel">
                {activeMissionId ? (
                  sidebarTab === "mission" ? (
                    missionDraft ? (
                      <MissionEditor
                        mission={missionDraft}
                        originalMissionId={missionOriginalIdRef.current || activeMissionId}
                        working={working}
                        dialoguePanel={
                          <div className="narrative-sections-grid narrative-mission-dialogues-grid">
                            {wrapLineEditor("intro", "Intro", introLines, selectedIntro, setSelectedIntro)}
                            {wrapLineEditor("return", "Return", returnLines, selectedReturn, setSelectedReturn)}
                          </div>
                        }
                        onChange={setMissionDraft}
                        onSave={(mission) => void handleSaveMission(mission)}
                        onDelete={() => void handleDeleteMission()}
                      />
                    ) : (
                      <div className="imagegen-panel-body narrative-empty-state">
                        <p className="narrative-empty-title">Loading mission…</p>
                      </div>
                    )
                  ) : (
                    <>
                      <NarrativeEditorHeader
                        missionId={activeMissionId}
                        introCount={introLines.length}
                        returnCount={returnLines.length}
                        selectedCount={selectedLineCount}
                      />
                      <div className="narrative-sections-grid">
                        {wrapLineEditor("intro", "Intro", introLines, selectedIntro, setSelectedIntro)}
                        {wrapLineEditor("return", "Return", returnLines, selectedReturn, setSelectedReturn)}
                      </div>
                    </>
                  )
                ) : (
                  <div className="imagegen-panel-body narrative-empty-state">
                    <p className="narrative-empty-title">Select a mission</p>
                    <p className="narrative-hint">
                      {sidebarTab === "mission"
                        ? "Choose a mission from the list to edit its fields, or add a new one."
                        : "Choose a mission from the list to edit intro and return dialogue."}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      }
    rightStyle={{ minHeight: "min(78vh, 960px)" }}
    />
    <ImproveReviewModal
      open={improveProposals.length > 0}
      proposals={improveProposals}
      working={working}
      onAccept={(clipId) => void handleAcceptImprove(clipId)}
      onDecline={handleDeclineImprove}
      onAcceptAll={() => void handleAcceptAllImprove()}
      onDeclineAll={handleDeclineAllImprove}
    />
    {improving && (
      <div className="generate-overlay narrative-generate-overlay" aria-live="polite" aria-busy="true">
        <div className="generate-spinner" />
        <div className="generate-overlay-text">Improving dialogue…</div>
      </div>
    )}
    </>
  );
}
