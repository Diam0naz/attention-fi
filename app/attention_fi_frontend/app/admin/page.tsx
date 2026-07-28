import type { Metadata } from "next";
import { AdminView } from "@/components/admin/admin-view";

/**
 * Authority-only console. Unlinked from the nav by design — the real gate is
 * on-chain (`address = global.authority` on every instruction here), so this
 * is only about not advertising the route.
 */
export const metadata: Metadata = {
  title: "Admin · AttentionFi",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminPage() {
  return <AdminView />;
}
