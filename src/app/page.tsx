import type { Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { FanGame } from "./fan-game";
import "./fan-theme.css";

const archivo = localFont({
  src: "./fonts/archivo-latin.woff2",
  variable: "--font-fan-number",
  weight: "100 900",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e0e0f",
};

export default function Home() {
  return (
    <div className={`${archivo.variable} fan-experience`}>
      <FanGame />
      <footer className="fan-footer">
        <Link href="/kbo-test" className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4">
          KBO API 테스트
        </Link>
      </footer>
    </div>
  );
}
