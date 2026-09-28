import Link from "next/link";

export function Logo({ tagline }: { tagline: string }) {
  return (
    <Link href="/" className="flex items-center gap-3 font-serif" aria-label="RemPham Ly Box home">
      <i className="h-[9px] w-[9px] rotate-45 rounded-[1px] bg-gold" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-medium tracking-[0.08em] uppercase whitespace-nowrap sm:text-[21px] sm:tracking-[0.14em]">
          RemPham Ly Box
        </span>
        <small className="mt-[5px] font-sans text-[9.5px] font-semibold tracking-[0.32em] text-gold uppercase">{tagline}</small>
      </span>
    </Link>
  );
}
