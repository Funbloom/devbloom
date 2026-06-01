/**
 * Browser copies of games/<game_key>/manifest.json (Next.js cannot import outside web/).
 * When adding a game: add games/<key>/manifest.json, mirror to app/lib/games/<key>/manifest.json,
 * then import the JSON below.
 */
import pocketVoyager from "./games/pocket_voyager/manifest.json";
import solitaire from "./games/solitaire/manifest.json";

export const GAME_MANIFESTS = [pocketVoyager, solitaire];
