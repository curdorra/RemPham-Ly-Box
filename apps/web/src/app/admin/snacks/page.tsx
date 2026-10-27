import type { Metadata } from "next";
import Link from "next/link";
import type { AdminKitchen } from "@ott/shared";
import { KitchenManager } from "@/components/admin/KitchenManager";
import { apiGet } from "@/lib/api-server";

export const metadata: Metadata = { title: "Kitchens & snacks · Staff" };

export default async function AdminSnacksPage() {
  const kitchens = await apiGet<AdminKitchen[]>("/admin/kitchens");
  return (
    <div className="max-w-4xl">
      <h1 className="display mb-3 text-[clamp(40px,5vw,68px)]">Kitchens & snacks</h1>
      <p className="mb-8 text-ink-2">
        Menus and prices for the snack shop. Incoming orders are on the <Link href="/admin" className="text-gold hover:underline">Overview</Link>.
      </p>
      <KitchenManager kitchens={kitchens} />
    </div>
  );
}
