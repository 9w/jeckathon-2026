"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Game, LiveTextLine, Scoreboard } from "@/lib/kbo";

type Fn = "state" | "scoreboard" | "ground" | "result" | "livetext" | "boxscore";

const TABS: { fn: Fn; label: string }[] = [
  { fn: "scoreboard", label: "스코어보드" },
  { fn: "state", label: "경기상태" },
  { fn: "ground", label: "그라운드" },
  { fn: "livetext", label: "문자중계" },
  { fn: "boxscore", label: "박스스코어" },
  { fn: "result", label: "결과요약" },
];

const SAMPLE_DATE = "2026-04-12";

const STATUS_LABEL: Record<Game["status"], string> = {
  SCHEDULED: "예정",
  IN_PROGRESS: "진행중",
  FINISHED: "종료",
  CANCELED: "취소",
};

type ApiResult<T> = { data?: T; error?: string; ms?: number; status?: number };

async function callApi<T>(query: Record<string, string>): Promise<ApiResult<T>> {
  try {
    const res = await fetch(`/api/kbo?${new URLSearchParams(query)}`, { cache: "no-store" });
    return { ...(await res.json()), status: res.status };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function kstToday(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
}

export function KboTester() {
  const [date, setDate] = useState(""); // 오늘 날짜는 prerender 시점이 아닌 클라이언트에서 채운다
  const [games, setGames] = useState<ApiResult<Game[]> | null>(null);
  const [loadingGames, setLoadingGames] = useState(false);
  const [gameId, setGameId] = useState<string | null>(null);

  const loadGames = useCallback(async (d: string) => {
    setLoadingGames(true);
    setGameId(null);
    setGames(await callApi<Game[]>({ fn: "games", date: d.replaceAll("-", "") }));
    setLoadingGames(false);
  }, []);

  useEffect(() => {
    // 첫 진입 시 오늘 경기 자동 조회
    const today = kstToday();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDate(today);
    loadGames(today);
  }, [loadGames]);

  return (
    <>
      <section className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 dark:border-white/15"
          />
          <button
            onClick={() => loadGames(date)}
            disabled={loadingGames}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {loadingGames ? "조회중…" : "조회"}
          </button>
        </div>
        <div className="flex gap-2 text-xs">
          <Chip onClick={() => { setDate(kstToday()); loadGames(kstToday()); }}>오늘</Chip>
          <Chip onClick={() => { setDate(SAMPLE_DATE); loadGames(SAMPLE_DATE); }}>
            샘플 (2026-04-12)
          </Chip>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Meta result={games} label="getGames" />
        {games?.data?.length === 0 && (
          <p className="rounded-lg border border-dashed border-black/15 p-4 text-center text-sm opacity-60 dark:border-white/15">
            경기가 없습니다. 비시즌이면 샘플 날짜를 눌러보세요.
          </p>
        )}
        {games?.data?.map((g) => (
          <button
            key={g.id}
            onClick={() => setGameId(g.id === gameId ? null : g.id)}
            className={`flex flex-col gap-1 rounded-xl border p-3 text-left transition ${
              g.id === gameId
                ? "border-blue-500 bg-blue-500/5"
                : "border-black/10 dark:border-white/10"
            }`}
          >
            <div className="flex items-center justify-between text-xs opacity-60">
              <span>
                {g.startTime} · {g.stadium}
              </span>
              <span className={g.status === "IN_PROGRESS" ? "font-semibold text-red-500 opacity-100" : ""}>
                {STATUS_LABEL[g.status]}
                {g.status === "IN_PROGRESS" && g.currentInning ? ` ${g.currentInning}회` : ""}
              </span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>{g.awayTeam}</span>
              <span className="tabular-nums">
                {g.status === "SCHEDULED" || g.status === "CANCELED" ? "vs" : `${g.awayScore} : ${g.homeScore}`}
              </span>
              <span>{g.homeTeam}</span>
            </div>
            <div className="text-xs opacity-50">{g.id}</div>
          </button>
        ))}
      </section>

      {gameId && <GameDetail key={gameId} gameId={gameId} />}
    </>
  );
}

function GameDetail({ gameId }: { gameId: string }) {
  const [tab, setTab] = useState<Fn>("scoreboard");
  // 결과에 어느 탭(fn)의 응답인지 같이 저장한다. 탭을 바꾼 직후에는 이전 탭의 데이터가
  // 남아 있어서, 이걸 새 탭의 뷰에 넘기면 타입이 달라 렌더가 깨진다 (예: 문자중계 탭에 스코어보드 객체).
  const [result, setResult] = useState<(ApiResult<unknown> & { fn: Fn }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    const res = await callApi({ fn: tab, gameId });
    // 탭을 빠르게 바꾸면 늦게 도착한 이전 응답이 최신 결과를 덮어쓰지 않도록 무시
    if (requestId !== latestRequest.current) return;
    setResult({ ...res, fn: tab });
    setLoading(false);
  }, [tab, gameId]);

  const current = result?.fn === tab ? result : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    if (!auto) return;
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load, auto]);

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
      <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.fn}
            onClick={() => setTab(t.fn)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              t.fn === tab ? "bg-foreground text-background" : "bg-black/5 dark:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <Meta result={current} label={tab} loading={loading} />
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            10초 자동
          </label>
          <button onClick={load} className="underline">
            새로고침
          </button>
        </div>
      </div>

      {current?.data != null && (
        <>
          {tab === "scoreboard" && <ScoreboardView data={current.data as Scoreboard} />}
          {tab === "livetext" && <LiveTextView lines={current.data as LiveTextLine[]} />}
          {(tab !== "scoreboard" && tab !== "livetext") || showRaw ? (
            <pre className="max-h-96 overflow-auto rounded-lg bg-black/5 p-3 font-mono text-[11px] leading-snug dark:bg-white/5">
              {JSON.stringify(current.data, null, 2)}
            </pre>
          ) : (
            <button onClick={() => setShowRaw(true)} className="self-start text-xs underline opacity-60">
              원본 JSON 보기
            </button>
          )}
        </>
      )}
      {current?.data === null &&<p className="text-sm opacity-60">데이터 없음 (null)</p>}
    </section>
  );
}

function ScoreboardView({ data }: { data: Scoreboard }) {
  const innings = Math.max(9, ...[data.away, data.home].map((t) => t.innings.findLastIndex((v) => v !== null) + 1));
  const cols = Array.from({ length: innings }, (_, i) => i);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-center text-sm tabular-nums">
        <thead className="text-xs opacity-50">
          <tr>
            <th className="py-1 text-left">팀</th>
            {cols.map((i) => <th key={i}>{i + 1}</th>)}
            <th className="pl-2">R</th>
            <th>H</th>
            <th>E</th>
            <th>B</th>
          </tr>
        </thead>
        <tbody>
          {[data.away, data.home].map((t) => (
            <tr key={t.team} className="border-t border-black/10 dark:border-white/10">
              <td className="py-1.5 pr-2 text-left font-medium whitespace-nowrap">{t.team}</td>
              {cols.map((i) => <td key={i} className="px-0.5">{t.innings[i] ?? "-"}</td>)}
              <td className="pl-2 font-bold">{t.runs}</td>
              <td>{t.hits}</td>
              <td>{t.errors}</td>
              <td>{t.balls}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveTextView({ lines }: { lines: LiveTextLine[] }) {
  return (
    <ol className="flex max-h-96 flex-col gap-1 overflow-auto text-sm">
      {lines.map((l, i) => (
        <li
          key={i}
          className={
            l.type === "inning"
              ? "mt-2 font-semibold text-blue-600 dark:text-blue-400"
              : l.type === "info"
                ? "text-xs opacity-50"
                : ""
          }
        >
          {l.text}
        </li>
      ))}
    </ol>
  );
}

function Meta({ result, label, loading }: { result: ApiResult<unknown> | null; label: string; loading?: boolean }) {
  if (loading) return <span className="text-xs opacity-60">{label} 호출중…</span>;
  if (!result) return null;
  if (result.error)
    return (
      <span className="text-xs text-red-500">
        {label} 실패{result.status ? ` (${result.status})` : ""}: {result.error}
      </span>
    );
  const count = Array.isArray(result.data) ? ` · ${result.data.length}건` : "";
  return (
    <span className="text-xs opacity-60">
      {label} ✓ {result.ms}ms{count}
    </span>
  );
}

function Chip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-full bg-black/5 px-3 py-1 dark:bg-white/10">
      {children}
    </button>
  );
}
