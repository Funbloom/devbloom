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

export type LocalModelsInstallationStatus = {
  installed: boolean;
  sam_model_type: string;
  sam_checkpoint_path_set: boolean;
  sam_checkpoint_exists: boolean;
  torch_installed: boolean;
  segment_anything_installed: boolean;
  pytorch_installed: boolean;
  hunyuan3d2_installed: boolean;
  custom_rasterizer_installed: boolean;
  differentiable_renderer_installed: boolean;
  hf_home_set: boolean;
  hf_home_exists: boolean;
  hf_home_writable: boolean;
  cuda_available: boolean;
  cuda_version: string;
  gpu_name: string;
  python_3_10_installed: boolean;
  python_version: string;
};

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
      const parsed = JSON.parse(text) as { detail?: unknown };
      const d = parsed.detail;
      if (typeof d === "string") message = d;
      else if (Array.isArray(d) && d[0] != null && typeof d[0] === "object" && "msg" in d[0]) {
        message = String((d[0] as { msg: unknown }).msg);
      }
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
  installationStatus(): Promise<LocalModelsInstallationStatus> {
    return requestLocalAgent("/installation_status", { method: "GET", body: undefined });
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
  projectFileExists(projectRoot: string, relativePath: string): Promise<boolean> {
    return requestLocalAgent<{ exists?: boolean }>("/files/binary/exists", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot, relative_path: relativePath }),
    }).then((result) => Boolean(result.exists));
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
  resizeImagesInDirectory(body: {
    directory_path: string;
    width: number;
    height: number;
  }): Promise<{
    directory: string;
    requested_width: number;
    requested_height: number;
    processed_count: number;
    failed_count: number;
    processed: Array<{
      filename: string;
      path: string;
      old_width: number;
      old_height: number;
      width: number;
      height: number;
    }>;
    failed: Array<{ filename: string; error: string }>;
  }> {
    return requestLocalAgent("/images/resize_directory", {
      method: "POST",
      body: JSON.stringify(body),
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
  installHunyuanTextureExtensions(): Promise<{
    ok: boolean;
    custom_rasterizer_installed: boolean;
    differentiable_renderer_installed: boolean;
    logs: { custom_rasterizer: string; differentiable_renderer: string };
  }> {
    return requestLocalAgent("/meshgen/install_texture_extensions", {
      method: "POST",
      body: "{}",
    });
  },
  /** Open a folder under an approved project in Explorer / Finder / xdg-open. */
  revealFolder(projectRoot: string, relativePath: string): Promise<{ ok: boolean; path: string }> {
    const norm = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
    return requestLocalAgent("/fs/reveal_folder", {
      method: "POST",
      body: JSON.stringify({ project_root: projectRoot, relative_path: norm }),
    });
  },
  /** Segment Anything (local venv). Requires SAM_CHECKPOINT_PATH; see local_agent/README-SAM.md */
  uiBreakdownSam(body: {
    project_root: string;
    filename: string;
    max_elements: number;
    min_box_fraction: number;
    sam?: Record<string, number>;
  }): Promise<{
    elements: Array<{
      id: string;
      label: string;
      x_min: number;
      y_min: number;
      x_max: number;
      y_max: number;
      /** Full-image grayscale PNG (base64) — white = segment; used for colored mask overlay in Breakdown. */
      mask_png_base64?: string;
      /** mask area / image area (SAM `area`); used for panoptic-style draw order. */
      mask_area_fraction?: number;
    }>;
    image_width: number;
    image_height: number;
  }> {
    return requestLocalAgent("/ui_breakdown/sam", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },
};

/** Build a display path under a local project root using the same separator style as the root (e.g. Windows backslashes). */
export function joinLocalProjectSubpath(projectRoot: string, ...segments: string[]): string {
  const root = projectRoot.trim().replace(/[/\\]+$/, "");
  if (!root) return segments.filter(Boolean).join("/");
  const preferBackslash = root.includes("\\");
  const sep = preferBackslash ? "\\" : "/";
  const tail = segments
    .flatMap((s) => s.split(/[/\\]+/))
    .filter(Boolean)
    .join(sep);
  return `${root}${sep}${tail}`;
}

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
