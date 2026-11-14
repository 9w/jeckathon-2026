import Link from "next/link";

export default function Home() {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-black/10 bg-background/80 px-4 backdrop-blur dark:border-white/10">
        <h1 className="text-lg font-semibold">Jeckathon 2026</h1>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-base leading-relaxed opacity-80">
          모바일 웹 기본 셋팅이 완료되었습니다. <code>src/app/page.tsx</code>를
          수정해서 시작하세요.
        </p>
        <Link
          href="/kbo-test"
          className="rounded-xl border border-black/10 p-4 font-medium dark:border-white/10"
        >
          KBO API 테스트 →
        </Link>
      </main>

      <footer className="px-4 py-4 text-center text-xs opacity-50">
        © 2026 Jeckathon
      </footer>
    </>
  );
}
