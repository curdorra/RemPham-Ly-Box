import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <div className="gutter relative flex min-h-screen flex-col items-start justify-center gap-12 bg-[linear-gradient(90deg,rgba(40,48,52,.95),rgba(47,55,58,.9)_60%,#2f373a)] pt-28 pb-16 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-[520px]">
        <h2 className="display text-[clamp(36px,5vw,60px)]">A story for every night of the week.</h2>
        <p className="mt-5 text-[15px] text-ink-2">One account for TV, web and phone. Up to five profiles.</p>
      </div>
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
