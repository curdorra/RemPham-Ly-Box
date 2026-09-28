import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";

export const metadata: Metadata = { title: "Sign up" };

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(122,22,33,.5),transparent_60%)] pt-24 px-4">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
