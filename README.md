# Jeckathon 2026

Next.js(App Router) + Tailwind CSS 기반 모바일 웹. Vercel로 배포한다.

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

**GitHub 연동 (권장)**

1. 이 저장소를 GitHub에 push
2. https://vercel.com/new 에서 `9w/jeckathon-2026` Import
3. 설정은 자동 감지(Framework: Next.js, Install: `pnpm install`, Build: `next build`) 그대로 Deploy
4. 이후 `main` push → 프로덕션 배포, 다른 브랜치/PR → 프리뷰 배포

**CLI**

```bash
pnpm dlx vercel        # 최초 실행 시 로그인·프로젝트 연결, 프리뷰 배포
pnpm dlx vercel --prod # 프로덕션 배포
```
