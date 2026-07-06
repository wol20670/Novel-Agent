// 새 협업 방을 만들 때 보여줄 6자리 코드 — 친구에게 이 숫자만 알려주면 된다.
export function generateRoomCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
