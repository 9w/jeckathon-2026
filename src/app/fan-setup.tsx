import { useState, type CSSProperties, type ReactNode } from "react";
import type { Team } from "@/lib/fan-session";

export const teams = {
  lg: { label: "LG 트윈스", short: "LG", colors: ["#c30452", "#6b6b6b"] },
  doosan: { label: "두산 베어스", short: "두산", colors: ["#4e4cc8", "#ed1c24"] },
} as const;

const league = [
  { ...teams.lg, id: "lg" }, { ...teams.doosan, id: "doosan" },
  { label: "KIA 타이거즈", short: "KIA", colors: ["#ea0029", "#06141f"] },
  { label: "KT 위즈", short: "KT", colors: ["#eb1c24", "#000000"] },
  { label: "NC 다이노스", short: "NC", colors: ["#4a72b8", "#c7a079"] },
  { label: "삼성 라이온즈", short: "삼성", colors: ["#1a5fc2", "#c0c0c0"] },
  { label: "롯데 자이언츠", short: "롯데", colors: ["#2f5596", "#d00f31"] },
  { label: "SSG 랜더스", short: "SSG", colors: ["#ce0e2d", "#ffb81c"] },
  { label: "키움 히어로즈", short: "키움", colors: ["#b0203f", "#7f7f7f"] },
  { label: "한화 이글스", short: "한화", colors: ["#fc4e00", "#07111f"] },
] satisfies { id?: Team; label: string; short: string; colors: readonly string[] }[];

export const randomNicknames = ["잠실직관러", "외야석장인", "치맥요정", "9회말역전러", "응원단장", "직관요정", "홈런기원", "불펜지킴이", "1루석터줏대감", "파울볼수집가"];

export function TeamDots({ colors }: { colors: readonly string[] }) {
  return <span className="fan-side-dots" aria-hidden="true"><i style={{ background: colors[0] }} /><i style={{ background: colors[1] }} /></span>;
}

export function FanSheet({ title, aside, onClose, children }: { title: string; aside?: string; onClose: () => void; children: ReactNode }) {
  return (
    <dialog
      ref={(node) => { if (node && !node.open) node.showModal(); }}
      aria-label={title}
      className="fan-sheet"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="fan-sheet-content">
        <div className="fan-sheet-handle" aria-hidden="true" />
        <header><h2>{title}</h2>{aside && <span>{aside}</span>}</header>
        {children}
      </div>
    </dialog>
  );
}

export function TeamSheet({ selected, onSelect, onClose }: { selected: Team; onSelect: (team: Team) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = league.filter(({ label, short }) => label.toLowerCase().includes(query.trim().toLowerCase()) || short.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <FanSheet title="오늘 경기 진영 선택" aside="LG vs 두산" onClose={onClose}>
      <input type="search" aria-label="팀 이름 검색" placeholder="팀 이름 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      <ul className="fan-sheet-teams">
        {filtered.map((team) => {
          const id = "id" in team ? team.id : undefined;
          return <li key={team.short}>
            <button type="button" onClick={() => { if (id) onSelect(id); }} disabled={!id} aria-pressed={id ? selected === id : undefined}>
              <TeamDots colors={team.colors} />
              <strong>{team.label}</strong>
              {!id && <small>오늘 경기 없음</small>}
              <span className="fan-side-check" aria-hidden="true">{id === selected ? "✓" : ""}</span>
            </button>
          </li>;
        })}
        {filtered.length === 0 && <li className="fan-sheet-empty">검색 결과가 없어요</li>}
      </ul>
      <button type="button" className="fan-stage-button" onClick={onClose}>선택 완료</button>
    </FanSheet>
  );
}

export const setupProgress = (valid: boolean): CSSProperties => ({ width: valid ? "100%" : "66.67%" });
