import Link from "next/link";
import { FanGame } from "./fan-game";

export default function Home() {
  return (
    <>
      <FanGame />
      <footer className="border-t border-black/10 px-5 py-2 dark:border-white/15">
        <Link href="/kbo-test" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
          KBO API 테스트
        </Link>
      </footer>
    </>
  );
}
