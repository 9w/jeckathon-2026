export function normalizeNickname(input: string): string | null {
  const nickname = input.trim();
  const length = Array.from(nickname).length;

  return length >= 2 && length <= 16 && !/\p{Cc}/u.test(nickname)
    ? nickname
    : null;
}
