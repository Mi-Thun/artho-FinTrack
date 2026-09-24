import { redirect } from "next/navigation";

// SP and Sanchayapatra are the same thing — "SP" is simply the common short form. They
// briefly had a page each, which meant two places to enter one holding. The SP tab under
// Deposits is now the single home; this route stays only so older links and bookmarks
// still land somewhere sensible.
export default function SanchayapatraPage() {
  redirect("/deposits");
}
