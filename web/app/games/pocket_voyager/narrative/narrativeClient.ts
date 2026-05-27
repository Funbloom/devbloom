import { fetchApi } from "../../../lib/api";

export type MissionSummary = { id: string; title: string };

export type DialogueLineRow = {
  id: string;
  line_type: "intro" | "return";
  script_text: string;
  character_name: string;
  voice_name: string;
  mood: string | null;
  warning: string | null;
};

export type ValidateResponse = {
  missions: MissionSummary[];
  errors: string[];
  warnings: string[];
  orphan_clip_ids: string[];
};

export type MissionLinesResponse = {
  mission_id: string;
  intro: DialogueLineRow[];
  return_lines: DialogueLineRow[];
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetchApi(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (typeof parsed.detail === "string") {
        detail = parsed.detail;
      }
    } catch {
      // keep text
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function narrativeValidate(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>
): Promise<ValidateResponse> {
  return postJson("/narrative/validate", { missions, dialogues });
}

export async function narrativeMissionLines(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string
): Promise<MissionLinesResponse> {
  return postJson("/narrative/mission-lines", { missions, dialogues, mission_id: missionId });
}

export async function narrativeLineAdd(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string,
  lineType: "intro" | "return",
  clip: Record<string, unknown>
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/line/add", {
    missions,
    dialogues,
    mission_id: missionId,
    line_type: lineType,
    clip,
  });
}

export async function narrativeLineUpdate(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  clipId: string,
  fields: Record<string, unknown>,
  newId?: string
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/line/update", {
    missions,
    dialogues,
    clip_id: clipId,
    fields,
    new_id: newId,
  });
}

export async function narrativeLineDelete(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  clipId: string
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/line/delete", { missions, dialogues, clip_id: clipId });
}

export async function narrativeLineReorder(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string,
  lineType: "intro" | "return",
  orderedIds: string[]
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/line/reorder", {
    missions,
    dialogues,
    mission_id: missionId,
    line_type: lineType,
    ordered_ids: orderedIds,
  });
}

export async function narrativeMissionTitle(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string,
  title: string
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/mission/title", {
    missions,
    dialogues,
    mission_id: missionId,
    title,
  });
}

export async function narrativeMissionAdd(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  mission: Record<string, unknown>
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/mission/add", { missions, dialogues, mission });
}

export async function narrativeMissionUpdate(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string,
  mission: Record<string, unknown>,
  newId?: string
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/mission/update", {
    missions,
    dialogues,
    mission_id: missionId,
    mission,
    new_id: newId,
  });
}

export async function narrativeMissionDelete(
  missions: Record<string, unknown>,
  dialogues: Record<string, unknown>,
  missionId: string
): Promise<{ missions: Record<string, unknown>; dialogues: Record<string, unknown> }> {
  return postJson("/narrative/mission/delete", { missions, dialogues, mission_id: missionId });
}

export async function narrativeImprove(
  dialogues: Record<string, unknown>,
  clipIds: string[],
  userPrompt: string
): Promise<Record<string, string>> {
  const data = await postJson<{ improved: Record<string, string> }>("/narrative/improve", {
    missions: {},
    dialogues,
    clip_ids: clipIds,
    user_prompt: userPrompt,
  });
  return data.improved ?? {};
}
