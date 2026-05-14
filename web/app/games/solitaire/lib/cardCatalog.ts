/** Canonical rank ids (lowercase) for filenames and prompts. */
export const CARD_RANK_IDS: readonly string[] = [
  "ace",
  "king",
  "queen",
  "jack",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

/** Canonical suit ids for filenames and prompts. */
export const CARD_SUIT_IDS: readonly string[] = ["clubs", "diamonds", "hearts", "spades"] as const;

export type CardRankId = (typeof CARD_RANK_IDS)[number];
export type CardSuitId = (typeof CARD_SUIT_IDS)[number];

const RANK_LABEL: Record<string, string> = {
  ace: "Ace",
  king: "King",
  queen: "Queen",
  jack: "Jack",
  "10": "10",
  "9": "9",
  "8": "8",
  "7": "7",
  "6": "6",
  "5": "5",
  "4": "4",
  "3": "3",
  "2": "2",
};

const SUIT_LABEL: Record<string, string> = {
  clubs: "Clubs",
  diamonds: "Diamonds",
  hearts: "Hearts",
  spades: "Spades",
};

export function rankLabel(rankId: string): string {
  return RANK_LABEL[rankId] ?? rankId;
}

export function suitLabel(suitId: string): string {
  return SUIT_LABEL[suitId] ?? suitId;
}

/**
 * Last path segment of the destination folder, slugged for use as the filename flavor prefix.
 * Example: `Assets/StreamingAssets/Solitaire/Classic` → `classic`.
 */
export function flavorSlugFromDestinationRelativePath(destRelative: string): string {
  const normalized: string = destRelative.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const segments: string[] = normalized.split("/").filter((s) => s.length > 0);
  const last: string = segments.length > 0 ? segments[segments.length - 1]! : "";
  const slug: string = last
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return slug.length > 0 ? slug : "cards";
}

/** Filename: `<flavor>_<card>_<suit>.png` (card = rank id, e.g. `classic_ace_spades.png`). */
export function cardOutputFilename(flavorSlug: string, rankId: string, suitId: string): string {
  return `${flavorSlug}_${rankId}_${suitId}.png`;
}

const RANK_ID_SET: ReadonlySet<string> = new Set<string>(CARD_RANK_IDS);
const SUIT_ID_SET: ReadonlySet<string> = new Set<string>(CARD_SUIT_IDS);

/**
 * If `filename` matches `<anything>_<rank>_<suit>.png` with known rank/suit ids, returns them.
 * The flavor prefix may contain underscores; parsing is from the right.
 */
export function tryParseCardOutputFilename(filename: string): { rankId: string; suitId: string } | null {
  if (!/\.png$/i.test(filename)) {
    return null;
  }
  const base: string = filename.slice(0, -4);
  const lastUnderscore: number = base.lastIndexOf("_");
  if (lastUnderscore <= 0) {
    return null;
  }
  const suitId: string = base.slice(lastUnderscore + 1).toLowerCase();
  if (!SUIT_ID_SET.has(suitId)) {
    return null;
  }
  const beforeSuit: string = base.slice(0, lastUnderscore);
  const rankUnderscore: number = beforeSuit.lastIndexOf("_");
  if (rankUnderscore < 0) {
    return null;
  }
  const rankId: string = beforeSuit.slice(rankUnderscore + 1).toLowerCase();
  if (!RANK_ID_SET.has(rankId)) {
    return null;
  }
  return { rankId, suitId };
}

const SUIT_PIP_SINGULAR: Record<string, string> = {
  clubs: "club",
  diamonds: "diamond",
  hearts: "heart",
  spades: "spade",
};

/** Text for correct pip count / layout for this rank (indices separate from center pips). */
function suitPipCountInstruction(rankId: string, suitId: string): string {
  const r: string = rankId.toLowerCase();
  const s: string = suitId.toLowerCase();
  const pipWord: string = SUIT_PIP_SINGULAR[s] ?? "suit";
  const suitName: string = suitLabel(suitId);
  if (r === "ace") {
    return (
      "Ace layout: one large central suit emblem (standard ace composition) plus corner A indices; " +
      "do not use multiple scattered suit icons as on a numeral card."
    );
  }
  if (r === "jack" || r === "queen" || r === "king") {
    return (
      `Court card (${rankLabel(rankId)}): conventional portrait figure in the center with correct corner indices ` +
      `and small suit marks; do not fill the face with numeral-style repeated ${pipWord} icons.`
    );
  }
  let n: number;
  if (r === "10") {
    n = 10;
  } else {
    n = parseInt(r, 10);
  }
  if (!Number.isNaN(n) && n >= 2 && n <= 10) {
    return (
      `Numeral ${n}: the main face must show exactly ${n} ${pipWord} suit symbols (pips) in the standard symmetric arrangement for ${n} of ${suitName} ` +
      "(mirrored top and bottom where that rank uses it, evenly spaced, clearly readable — not one more or one fewer than " +
      `${n}; e.g. seven of ${suitName} → seven ${pipWord} icons, well formatted).`
    );
  }
  return "";
}

function suitStandardInkColor(suitId: string): "black" | "red" {
  const id: string = suitId.toLowerCase();
  if (id === "clubs" || id === "spades") {
    return "black";
  }
  if (id === "hearts" || id === "diamonds") {
    return "red";
  }
  return "black";
}

export function buildCardImagePrompt(rankId: string, suitId: string): string {
  const rank: string = rankLabel(rankId);
  const suit: string = suitLabel(suitId);
  const ink: "black" | "red" = suitStandardInkColor(suitId);
  const pipRule: string = suitPipCountInstruction(rankId, suitId);
  return (
    `Portrait playing card front: ${rank} of ${suit}. ` +
    "Tall vertical frame (portrait, height greater than width), standard poker-style proportions, single full card face. " +
    "Match the visual style, line weight, palette, and rendering of the reference image. " +
    "Standard readable indices and corner pips appropriate to the rank and suit. " +
    (pipRule ? `${pipRule} ` : "") +
    `Standard deck colors: clubs and spades use black ink; hearts and diamonds use red ink. ` +
    `For this card (${suit}), all suit symbols, pips, and rank markings must be ${ink} only — do not use the opposite color. ` +
    "Centered, sharp edges, no deck stack, no extra cards."
  );
}
