import type { Metadata } from "next";
import Link from "next/link";
import { KboTester } from "./kbo-tester";

export const metadata: Metadata = { title: "KBO API 테스트" };

export default function KboTestPage() {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-black/10 bg-background/80 px-4 backdrop-blur dark:border-white/10">
        <Link href="/" className="text-sm opacity-60">
          ←
        </Link>
        <h1 className="text-lg font-semibold">KBO API 테스트</h1>
      </header>
      <main className="flex flex-1 flex-col gap-4 px-4 py-4">
        <KboTester />
      </main>
    </>
  );
}
