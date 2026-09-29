import { redirect } from "next/navigation";

/** Legacy route kept for old links. */
export default function LegacyRedirect() {
  redirect("/catalog/experiences/new");
}
