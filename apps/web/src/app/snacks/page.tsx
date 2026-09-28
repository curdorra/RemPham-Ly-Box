import type { Metadata } from "next";
import { SectionHead } from "@/components/SectionHead";
import { SnackShop } from "@/components/SnackShop";
import { getSnacks } from "@/lib/api-server";
import { getT } from "@/lib/lang-server";

export const metadata: Metadata = { title: "Snacks" };

export default async function SnacksPage() {
  const [items, t] = await Promise.all([getSnacks(), getT()]);
  return (
    <div className="gutter pt-36">
      <SectionHead label={t("navSnacks")} title={t("snacksTitle")} sub={t("snacksSub")} />
      <SnackShop items={items} />
    </div>
  );
}
