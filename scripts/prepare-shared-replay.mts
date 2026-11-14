import { readFileSync } from "node:fs";
import { parseReplayGame } from "../src/lib/replay/parse.ts";
import { makeSharedReplay } from "../src/lib/replay/shared-import.mts";

const path = process.argv[2];
if (!path) throw new Error("사용법: node scripts/prepare-shared-replay.mts <경기 기록 JSON>");
const game = parseReplayGame(JSON.parse(readFileSync(path, "utf8")));
if (!game) throw new Error("9월 3일 LG·두산전의 검증 가능한 리플레이 파일이 필요합니다.");

const { rounds, ...match } = makeSharedReplay(game);
const sqlJson = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
console.log(`begin;
set local standard_conforming_strings = on;
insert into public.replay_games (id, played_on, away, home, duration_seconds)
select id, played_on, away, home, duration_seconds
from jsonb_populate_record(null::public.replay_games, ${sqlJson(match)});

insert into public.replay_rounds (game_id, id, inning, half, batter, open_second, close_second, reveal_second, result)
select ${sqlJson(match)}->>'id', id, inning, half, batter, open_second, close_second, reveal_second, result
from jsonb_populate_recordset(null::public.replay_rounds, ${sqlJson(rounds)});
commit;`);
