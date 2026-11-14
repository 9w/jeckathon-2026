const keyFor = (id: string) => `ipyagu-avatar:${id}`;

export function loadFanAvatar(id: string) {
  try {
    const image = localStorage.getItem(keyFor(id)) ?? "";
    return image.startsWith("data:image/webp;base64,") ? image : "";
  } catch {
    return "";
  }
}

export async function encodeFanAvatar(file: File) {
  if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
    throw new Error("10MB 이하의 사진을 선택해 주세요.");
  }
  const image = await createImageBitmap(file).catch(() => { throw new Error("사진을 열 수 없어요. 다른 파일을 선택해 주세요."); });
  try {
    const size = Math.min(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("사진을 처리하지 못했어요.");
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 256, 256);
    const thumbnail = canvas.toDataURL("image/webp", 0.85);
    if (!thumbnail.startsWith("data:image/webp;base64,")) throw new Error("이 브라우저에서는 사진을 저장할 수 없어요.");
    return thumbnail;
  } finally {
    image.close();
  }
}

export function storeFanAvatar(id: string, image: string) {
  localStorage.setItem(keyFor(id), image);
}
