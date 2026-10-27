import { redirect } from "next/navigation";
import { AdminNav } from "@/components/admin/AdminNav";
import { getMe } from "@/lib/api-server";

/** Staff area: every page below is for ADMIN accounts only (the API checks too). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "ADMIN") redirect("/");
  return (
    <div className="gutter pt-32">
      <div className="lbl text-gold">Staff</div>
      <div className="mt-3 mb-10">
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
