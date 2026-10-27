import Link from "next/link";

/** Wide Archivo wordmark with the outlined BOX chip. */
export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 whitespace-nowrap" aria-label="RemPham'Ly Box home">
      <span className="font-wide text-[14px] font-extrabold tracking-[.02em] uppercase [font-stretch:125%] sm:text-[16px]">RemPham&apos;Ly</span>
      <span className="font-wide border-[1.5px] border-current px-[5px] py-[3px] text-[8px] leading-none font-bold tracking-[.12em] uppercase [font-stretch:125%] sm:text-[10px]">Box</span>
    </Link>
  );
}
