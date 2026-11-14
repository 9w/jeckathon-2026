import { ImageResponse } from "next/og";

// PWA 아이콘 (임시). 실제 아이콘이 생기면 public/에 PNG를 두고 manifest 경로를 바꾸면 된다.
const SIZES = [192, 512] as const;

export function generateStaticParams() {
  return SIZES.map((size) => ({ size: String(size) }));
}

export async function GET(
  _req: Request,
  { params }: RouteContext<"/icons/[size]">,
) {
  const size = Number((await params).size);
  if (!SIZES.includes(size as (typeof SIZES)[number])) {
    return new Response("Not found", { status: 404 });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#171717",
          color: "#ffffff",
          fontSize: size * 0.5,
          fontWeight: 700,
        }}
      >
        J
      </div>
    ),
    { width: size, height: size },
  );
}
