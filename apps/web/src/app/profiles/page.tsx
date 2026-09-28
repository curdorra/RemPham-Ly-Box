import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ProfilePicker } from "@/components/ProfilePicker";
import { getMe } from "@/lib/api-server";

export const metadata: Metadata = { title: "Who's watching?" };

export default async function ProfilesPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [me, { next }] = await Promise.all([getMe(), searchParams]);
  if (!me) redirect("/login?next=/profiles");
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <div className="gutter flex min-h-[80svh] items-center pt-32">
      <ProfilePicker profiles={me.profiles} currentId={me.profile.id} next={safe} />
    </div>
  );
}
