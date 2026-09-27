import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-5xl font-black">Lost your way?</h1>
      <p className="text-muted">We couldn’t find that page.</p>
      <Link href="/" className="rounded bg-white px-5 py-2 font-semibold text-black">Home</Link>
    </div>
  );
}
