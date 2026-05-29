export const AUDIOBANK_DEST_FOLDER_KEY = "audiobank_dest_folder_v1";
export const AUDIOBANK_OVERWRITE_KEY = "audiobank_overwrite_v1";
export const AUDIOBANK_OUTPUT_FORMAT_KEY = "audiobank_output_format_v1";
export const AUDIOBANK_DEFAULT_DEST_FOLDER = "Assets/_Data/Audio/SFX";

export type AudiobankOutputFormat = "original" | "wav" | "mp3";

export function isAudiobankOutputFormat(value: string): value is AudiobankOutputFormat {
  return value === "original" || value === "wav" || value === "mp3";
}

export function replaceFilenameExtension(filename: string, format: "wav" | "mp3"): string {
  const trimmed = (filename || "").trim();
  const stem = trimmed.includes(".") ? trimmed.replace(/\.[^.]+$/, "") : trimmed;
  return `${stem || "clip"}.${format}`;
}

export function resolveUseInProjectFilename(filename: string, format: AudiobankOutputFormat): string {
  if (format === "original") {
    return (filename || "").trim() || "clip";
  }
  return replaceFilenameExtension(filename, format);
}

export function normalizeProjectRelativePath(input: string): string {
  return input.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

export function relativeFolderFromPickedProject(projectRoot: string, pickedFolder: string): string | null {
  const rootNorm = projectRoot.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  const pickNorm = pickedFolder.replace(/[/\\]+$/, "").replace(/\\/g, "/");
  const rootLower = rootNorm.toLowerCase();
  const pickLower = pickNorm.toLowerCase();
  if (pickLower === rootLower) {
    return "";
  }
  if (!pickLower.startsWith(rootLower + "/")) {
    return null;
  }
  return pickNorm.slice(rootNorm.length).replace(/^\/+/, "");
}

export function joinRelativePath(dir: string, file: string): string {
  const base = normalizeProjectRelativePath(dir).replace(/\/+$/, "");
  const name = file.replace(/^\/+/, "");
  return base ? `${base}/${name}` : name;
}

/** Map audiobank category path (ui/button) to Unity-style folders (UI/Button). */
export function categoryToProjectFolderPath(category: string): string {
  const normalized = normalizeProjectRelativePath(category);
  if (!normalized || normalized === "uncategorized" || normalized === "system") {
    return "";
  }
  return normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const lower = segment.toLowerCase();
      if (lower.length <= 2) {
        return lower.toUpperCase();
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("/");
}

export function buildUseInProjectRelativePath(
  destRelative: string,
  category: string,
  filename: string
): string {
  const categoryFolder = categoryToProjectFolderPath(category);
  const destWithCategory = categoryFolder ? joinRelativePath(destRelative, categoryFolder) : destRelative;
  return joinRelativePath(destWithCategory, filename);
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export type CategoryTreeNode = {
  name: string;
  path: string;
  clipCount: number;
  children: CategoryTreeNode[];
};

export function buildCategoryTree(categories: Array<{ category: string; clip_count: number }>): CategoryTreeNode[] {
  const rootChildren: CategoryTreeNode[] = [];
  const nodeByPath = new Map<string, CategoryTreeNode>();

  const sorted = [...categories].sort((a, b) => a.category.localeCompare(b.category));
  for (const item of sorted) {
    const parts = item.category.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }
    let path = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const parentPath = path;
      path = path ? `${path}/${part}` : part;
      let node = nodeByPath.get(path);
      if (!node) {
        node = {
          name: part,
          path,
          clipCount: 0,
          children: [],
        };
        nodeByPath.set(path, node);
        if (parentPath) {
          const parent = nodeByPath.get(parentPath);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          rootChildren.push(node);
        }
      }
      if (i === parts.length - 1) {
        node.clipCount += item.clip_count;
      }
    }
  }

  const rollUpCounts = (node: CategoryTreeNode): number => {
    let total = node.clipCount;
    for (const child of node.children) {
      total += rollUpCounts(child);
    }
    node.clipCount = total;
    return total;
  };
  for (const node of rootChildren) {
    rollUpCounts(node);
  }
  return rootChildren;
}

export function clipMatchesCategory(clipCategory: string, selectedCategory: string): boolean {
  if (!selectedCategory) {
    return true;
  }
  return clipCategory === selectedCategory || clipCategory.startsWith(`${selectedCategory}/`);
}

export function clipMatchesFilter(clip: { filename: string; tags: string[] }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  if (clip.filename.toLowerCase().includes(q)) {
    return true;
  }
  return clip.tags.some((tag) => tag.toLowerCase().includes(q));
}

export async function projectRelativeFileExists(
  projectRoot: string,
  relativePath: string,
  fileExists: (projectRoot: string, relativePath: string) => Promise<boolean>
): Promise<boolean> {
  const normalized = normalizeProjectRelativePath(relativePath);
  if (!normalized) {
    return false;
  }
  return fileExists(projectRoot, normalized);
}
