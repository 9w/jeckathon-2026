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
