const LOCAL_AGENT_BASE =
  process.env.NEXT_PUBLIC_LOCAL_AGENT_URL || "http://127.0.0.1:8765";

function normalizedLocalAgentBase(): string {
  return LOCAL_AGENT_BASE.replace(/\/+$/, "");
}

const LOCAL_PROJECT_PATHS_KEY = "localProjectPaths";

function extraLocalAgentPageHosts(): Set<string> {
  const raw = process.env.NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS || "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * True when this browser tab may call the local agent (127.0.0.1 on the user's PC).
 * - Always true for localhost / 127.0.0.1.
 * - Also true when the page hostname is listed in NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS (build-time),
 *   if the agent allows that origin via LOCAL_AGENT_EXTRA_CORS_ORIGINS.
 */
export function isLocalAgentContext(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  return extraLocalAgentPageHosts().has(h);
}

function assertLocalAgentContext(): void {
  if (!isLocalAgentContext()) {
    throw new Error(
      "Local agent is not enabled for this site host. Use http://localhost, or set NEXT_PUBLIC_LOCAL_AGENT_PAGE_HOSTS at build time and LOCAL_AGENT_EXTRA_CORS_ORIGINS on the agent (see local_agent/README.md)."
    );
  }
}

type JsonValue = unknown;

type ResolveResponse = {
  project_root: string;
  cities_json: string;
  gift_catalog_json: string;
  gifts_images_dir: string;
  cities_json_exists: boolean;
  gift_catalog_json_exists: boolean;
};

export type FsListDirResponse = {
  current: string;
  parent: string | null;
  entries: Array<{ name: string; is_dir: boolean; full_path: string }>;
};

/** Native folder/file dialog result from the local agent (AppleScript on macOS, tkinter elsewhere). */
export type NativePickResult =
  | { cancelled: true; path?: undefined }
  | { cancelled: false; path: string };

function localAgentWrongServerHint(status: number): string {
  if (status !== 404) return "";
  return (
    " Set NEXT_PUBLIC_LOCAL_AGENT_URL to the agent (default http://127.0.0.1:8765), not the API (:8000)."
  );
}

async function requestLocalAgent<T>(path: string, options: RequestInit = {}): Promise<T> {
  assertLocalAgentContext();
  const url = `${normalizedLocalAgentBase()}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Local agent error: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: string | string[] };
      if (typeof parsed.detail === "string") message = parsed.detail;
      else if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) message = String(parsed.detail[0].msg);
    } catch {
      // keep message
    }
    const hint = localAgentWrongServerHint(res.status);
    if (message === "Not Found" || message.includes("Not Found")) {
      message = `Not found at ${url}.${hint}`;
    } else {
      message = `${message}${hint}`;
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const localAgent = {
  baseUrl: LOCAL_AGENT_BASE,
  async health(): Promise<boolean> {
    if (!isLocalAgentContext()) return false;
    try {
      const res = await fetch(`${normalizedLocalAgentBase()}/health`);
      if (!res.ok) return false;
      const data = (await res.json()) as { ok?: boolean; service?: string };
      return data.ok === true && data.service === "local_agent";
    } catch {
      return false;
    }
  },
  approveProjectRoot(projectRoot: string): Promise<{ ok: boolean; project_root: string }> {
    return requestLocalAgent("/projects/approve", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot }),
    });
  },
  /** List any directory on disk (absolute path). Empty string lists the current user home. Localhost-only. */
  listFsDir(path?: string): Promise<FsListDirResponse> {
    return requestLocalAgent("/fs/list_dir", {
      method: "POST",
      body: JSON.stringify({ path: path ?? "" }),
    });
  },
  /** Opens a native folder dialog on the machine running the agent; returns a full absolute path. */
  pickDirectory(): Promise<NativePickResult> {
    return requestLocalAgent("/fs/pick_directory", { method: "POST", body: "{}" });
  },
  /** Opens a native file dialog on the machine running the agent; returns a full absolute path. */
  pickFile(body?: { title?: string; filetypes?: [string, string][] }): Promise<NativePickResult> {
    return requestLocalAgent("/fs/pick_file", {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });
  },
  resolveProjectPaths(projectRoot: string): Promise<ResolveResponse> {
    return requestLocalAgent("/projects/resolve", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot }),
    });
  },
  readJson(projectRoot: string, relativePath: string): Promise<{ path: string; data: JsonValue }> {
    return requestLocalAgent("/files/json/read", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot, relative_path: relativePath }),
    });
  },
  writeJson(projectRoot: string, relativePath: string, data: JsonValue): Promise<{ ok: boolean }> {
    return requestLocalAgent("/files/json/write", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot, relative_path: relativePath, data }),
    });
  },
  listDir(
    projectRoot: string,
    relativePath: string
  ): Promise<{
    path: string;
    entries: Array<{ name: string; is_dir: boolean; is_file: boolean }>;
  }> {
    return requestLocalAgent("/dir/list", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot, relative_path: relativePath }),
    });
  },
  async readBinary(projectRoot: string, relativePath: string): Promise<Blob> {
    assertLocalAgentContext();
    const url = `${normalizedLocalAgentBase()}/files/binary/read`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_root: projectRoot, relative_path: relativePath }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Local agent error: ${res.status}`);
    }
    return await res.blob();
  },
  async writeBinary(
    projectRoot: string,
    relativePath: string,
    contentBase64: string
  ): Promise<{ ok: boolean }> {
    return requestLocalAgent("/files/binary/write", {
      method: "POST",
      body: JSON.stringify({
        project_root: projectRoot,
        relative_path: relativePath,
        content_base64: contentBase64,
      }),
    });
  },
  meshgenGenerate(body: {
    project_root: string;
    relative_path: string;
    image: string;
    seed: number;
    octree_resolution: number;
    num_inference_steps: number;
    guidance_scale: number;
    texture: boolean;
    type: "glb" | "obj";
    face_count: number;
  }): Promise<{ ok: boolean; path: string; relative_path: string }> {
    return requestLocalAgent("/meshgen/generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

export function getLocalProjectPath(projectKey: string): string | null {
  if (!projectKey) return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROJECT_PATHS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[projectKey] || null;
  } catch {
    return null;
  }
}

export function setLocalProjectPath(projectKey: string, path: string): void {
  if (!projectKey) return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROJECT_PATHS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    parsed[projectKey] = path;
    window.localStorage.setItem(LOCAL_PROJECT_PATHS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function clearLocalProjectPath(projectKey: string): void {
  if (!projectKey) return;
  try {
    const raw = window.localStorage.getItem(LOCAL_PROJECT_PATHS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, string>;
    delete parsed[projectKey];
    window.localStorage.setItem(LOCAL_PROJECT_PATHS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}
