"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { RatingValue, TitleSummary } from "@ott/shared";
import { formatInr } from "@/lib/format";
import { BookingSheet } from "./BookingSheet";
import { useT } from "./LangProvider";
import { MyListButton } from "./MyListButton";
import { RatingButtons } from "./RatingButtons";

export function TitleActions({
  title,
  playable,
  signedIn,
  inMyList,
  myRating,
  openingId,
}: {
  title: TitleSummary;
  playable: boolean;
  signedIn: boolean;
  inMyList: boolean;
  myRating: RatingValue | null;
  /** When set, the title is only sold for its opening night. */
  openingId?: string;
}) {
  const t = useT();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get("book") === "1" && !playable && !openingId) setOpen(true);
  }, [params, playable, openingId]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {playable ? (
          <Link href={`/watch/${title.id}`} className="btn btn-ivory">▶ {t("watch")}</Link>
        ) : openingId ? (
          <Link href={`/opening/${openingId}`} className="btn btn-red">{t("prebook")} · {formatInr(title.pricePaise)}</Link>
        ) : (
          <button className="btn btn-red" onClick={() => setOpen(true)}>{t("book")} · {formatInr(title.pricePaise)}</button>
        )}
        {signedIn && <MyListButton titleId={title.id} initial={inMyList} />}
        {signedIn && <RatingButtons titleId={title.id} initial={myRating} />}
      </div>
      {!openingId && <BookingSheet title={title} open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
