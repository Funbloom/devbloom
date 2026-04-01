const LOCAL_AGENT_BASE =
  process.env.NEXT_PUBLIC_LOCAL_AGENT_URL || "http://127.0.0.1:8765";

const LOCAL_PROJECT_PATHS_KEY = "localProjectPaths";

/**
 * The local agent binds to 127.0.0.1 and only allows browser origins on localhost.
 * A page served from https://your-domain.com must not call it: that would hit the user's
 * own machine (or fail CORS), not the server.
 */
export function isLocalAgentContext(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

function assertLocalAgentContext(): void {
  if (!isLocalAgentContext()) {
    throw new Error(
      "Local agent is only available when you open the app from http://localhost or http://127.0.0.1 on your PC."
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

async function requestLocalAgent<T>(path: string, options: RequestInit = {}): Promise<T> {
  assertLocalAgentContext();
  const url = `${LOCAL_AGENT_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Local agent error: ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { detail?: string };
      if (parsed.detail) message = parsed.detail;
    } catch {
      // keep message
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
      const res = await fetch(`${LOCAL_AGENT_BASE}/health`);
      return res.ok;
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
    const url = `${LOCAL_AGENT_BASE}/files/binary/read`;
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
