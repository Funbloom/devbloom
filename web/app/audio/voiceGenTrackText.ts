import { localAgent } from "../lib/localAgentClient";

const VOICE_GEN_TRACK_TEXT_KEY = "voice_gen_track_text_v1";

export function readVoiceGenTrackText(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(VOICE_GEN_TRACK_TEXT_KEY) === "1";
}

export function writeVoiceGenTrackText(enabled: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (enabled) {
      window.localStorage.setItem(VOICE_GEN_TRACK_TEXT_KEY, "1");
    } else {
      window.localStorage.removeItem(VOICE_GEN_TRACK_TEXT_KEY);
    }
  } catch {
    // ignore quota / private mode
  }
}

export function trackTextFileNameForMp3(mp3FileName: string): string {
  const lower = mp3FileName.toLowerCase();
  if (lower.endsWith(".mp3")) {
    return `${mp3FileName.slice(0, -4)}.txt`;
  }
  return `${mp3FileName}.txt`;
}

function utf8TextToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function writeVoiceGenTrackTextFile(
  projectRoot: string,
  mp3FileName: string,
  text: string,
): Promise<void> {
  const relativePath = trackTextFileNameForMp3(mp3FileName);
  await localAgent.writeBinary(projectRoot, relativePath, utf8TextToBase64(text));
}

export async function readVoiceGenTrackTextFile(
  projectRoot: string,
  mp3FileName: string,
): Promise<string | null> {
  const relativePath = trackTextFileNameForMp3(mp3FileName);
  try {
    const exists = await localAgent.projectFileExists(projectRoot, relativePath);
    if (!exists) {
      return null;
    }
    const blob = await localAgent.readBinary(projectRoot, relativePath);
    return await blob.text();
  } catch {
    return null;
  }
}

export async function deleteVoiceGenClipFiles(
  projectRoot: string,
  mp3FileName: string,
): Promise<void> {
  await localAgent.deleteFile(projectRoot, mp3FileName);
  const txtPath = trackTextFileNameForMp3(mp3FileName);
  const txtExists = await localAgent.projectFileExists(projectRoot, txtPath);
  if (txtExists) {
    await localAgent.deleteFile(projectRoot, txtPath);
  }
}
