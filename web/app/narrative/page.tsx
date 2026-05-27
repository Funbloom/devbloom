import { redirect } from "next/navigation";

/** Legacy Studio URL — Narrative lives under Pocket Voyager. */
export default function NarrativeLegacyRedirect() {
  redirect("/games/pocket_voyager/pipelines/narrative");
}
