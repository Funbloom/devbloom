export type LineTypeDefault = "intro" | "return";
export type NarrativeSidebarTab = "dialogues" | "mission";

export type NarrativeSession = {
  projectKey: string;
  missionsRelativePath: string;
  dialoguesRelativePath: string;
  missionsFilePath: string;
  dialoguesFilePath: string;
  activeMissionId: string;
  aiImprovePrompt: string;
  lineTypeDefault: LineTypeDefault;
  sidebarTab: NarrativeSidebarTab;
};

const STORAGE_KEY = "narrative_studio_v1";

export function readNarrativeSession(): NarrativeSession | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw?.trim()) {
    return null;
  }
  try {
    const data = JSON.parse(raw) as NarrativeSession;
    if (!data || typeof data !== "object") {
      return null;
    }
    return {
      projectKey: typeof data.projectKey === "string" ? data.projectKey : "",
      missionsRelativePath: typeof data.missionsRelativePath === "string" ? data.missionsRelativePath : "",
      dialoguesRelativePath: typeof data.dialoguesRelativePath === "string" ? data.dialoguesRelativePath : "",
      missionsFilePath: typeof data.missionsFilePath === "string" ? data.missionsFilePath : "",
      dialoguesFilePath: typeof data.dialoguesFilePath === "string" ? data.dialoguesFilePath : "",
      activeMissionId: typeof data.activeMissionId === "string" ? data.activeMissionId : "",
      aiImprovePrompt: typeof data.aiImprovePrompt === "string" ? data.aiImprovePrompt : "",
      lineTypeDefault: data.lineTypeDefault === "return" ? "return" : "intro",
      sidebarTab: data.sidebarTab === "mission" ? "mission" : "dialogues",
    };
  } catch {
    return null;
  }
}

export function writeNarrativeSession(session: NarrativeSession): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}
