# Jeckathon 2026

Next.js(App Router) + Tailwind CSS 기반 모바일 웹. Vercel로 배포한다.

## 접속 방법

**https://jeckathon-2026.vercel.app**

- 휴대폰 브라우저(Safari / Chrome)에서 위 주소로 접속
- 앱처럼 쓰기 (주소창 없이 전체 화면 실행)
  - **iPhone (Safari)**: 하단 공유 버튼 → "홈 화면에 추가"
  - **Android (Chrome)**: 우측 상단 ⋮ 메뉴 → "홈 화면에 추가" 또는 "앱 설치"
- PC에서 모바일 화면으로 보려면 개발자 도구(F12) → 기기 툴바(Ctrl/Cmd+Shift+M)
- 브랜치/PR 프리뷰 주소는 Vercel 대시보드 또는 GitHub PR의 Vercel 봇 코멘트에서 확인

## 로컬 개발

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

같은 Wi-Fi의 휴대폰에서 보려면 `pnpm dev -H 0.0.0.0` 후 `http://<내 PC IP>:3000` 접속.

### Supabase 연결

Supabase SDK를 사용하려면 로컬과 Vercel의 Node.js 버전을 22 이상으로 맞춥니다.

1. Supabase 프로젝트의 Authentication 설정에서 Anonymous Sign-Ins를 활성화합니다.
2. 프로젝트에 `supabase/migrations/20261114134000_fan_entry.sql`을 한 번 적용합니다.
3. `.env.local`과 Vercel 프로젝트 환경 변수에 Supabase URL 및 Publishable Key를 설정합니다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

팀을 선택하면 게스트 세션이 생성됩니다. 같은 브라우저에서 응원팀과 닉네임, 포인트 잔액 및 데모 투표를 이어서 볼 수 있습니다. 닉네임 검증 테스트는 `node --test tests/nickname.test.mjs`로 실행합니다.

### 타석 리플레이 데이터

2026년 9월 3일 LG·두산전은 투표 화면 하단 **경기 기록 파일 열기**에서 내부 검증용 `lg-doosan-20260903.json`을 선택해 재생합니다. 경기 시각과 경과 시간은 1배속으로 진행하고, 타임라인은 1초씩 이동합니다. 실제 경기 영상의 첫 투구 장면에서 경과 `0:00:06`(18:32:07 KST)에 맞춰 재생합니다. 편집으로 시간이 건너뛴 영상은 타임라인을 다시 맞춥니다. [KBO 게임센터](https://www.koreabaseball.com/Schedule/GameCenter/Main.aspx?gameDate=20260903&gameId=20260903LGOB0&section=REVIEW)

구별 기록이 포함된 파일은 전광판, 투수·타자, 볼카운트와 투구 결과를 표시합니다. **이전 구**와 **다음 구**를 누르면 재생을 멈추고 해당 투구로 이동합니다. 정확한 시각이 없는 2구는 직전 기록 시각에 표시합니다.

### 도발 카드와 포인트

Supabase에 기존 참가 마이그레이션 후 `20261114173000_fan_taunts.sql` 및 `20261114173500_fan_point_predictions.sql`을 순서대로 적용합니다. 경기방의 **포인트 예측**은 연습 타석이며, 정답을 맞히면 서버가 100P를 한 번 지급합니다. 도발 카드는 전송에 성공하면 100P를 차감합니다. 카드가 도착하면 경기방의 알림에서 열고, **반격 준비하기**로 발신자에게 답할 수 있습니다. 닫은 카드도 **내 기록 → 받은 도발**에서 다시 열 수 있습니다.

파일 선택 시 브라우저 메모리에서 읽으며 페이지를 새로 열면 다시 선택해야 합니다. 로컬 개발 서버는 `.local-replay/lg-doosan-20260903.json`이 있으면 자동으로 읽습니다. 구간은 완료된 66타석과 1회초 주루사로 중단된 문보경 타석을 포함합니다. 첫 투구 시각은 보정한 Sportradar 기록 기준입니다. [무료 체험 조건](https://developer.sportradar.com/sportradar-updates/page/terms-and-conditions)에 따라 데이터 파일은 Git과 Vercel 배포에서 제외합니다.

## 모바일 웹 셋팅

- `src/app/layout.tsx` — viewport(`device-width`, `viewport-fit=cover`), theme-color, iOS 홈 화면 앱 메타, `max-w-md` 모바일 컨테이너
- `src/app/globals.css` — `safe-area` 유틸리티(노치/홈 인디케이터), 입력창 16px(iOS 자동 확대 방지), 탭 하이라이트·오버스크롤 제거
- `src/app/manifest.ts` — PWA manifest(홈 화면에 추가 시 standalone 실행)
- `src/app/icons/[size]/route.tsx`, `src/app/apple-icon.tsx` — 임시 아이콘(192/512/180). 실제 아이콘이 생기면 교체

## Vercel 배포

GitHub 연동 완료

- `main` push → 프로덕션(https://jeckathon-2026.vercel.app) 자동 배포
- 다른 브랜치 push / PR → 프리뷰 URL 자동 생성

로그 확인 (CLI, 최초 1회 `pnpm dlx vercel link`로 프로젝트 연결 필요):

```bash
pnpm dlx vercel logs --query 'level:error'
```
