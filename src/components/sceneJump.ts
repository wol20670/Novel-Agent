// 장면 카드로 이동 — RightPanel 의 "🎮 장면 리모컨"과 CenterPanel 의 번역 QA 의심 카운트가 공유한다.
//
// ⚠️ 스크롤 루틴은 RightPanel 에 있던 **검증된 구현을 그대로 옮긴 것**이다. 알고리즘·재시도 횟수·
//    타이밍·selector 를 손대지 말 것 — content-visibility 환경에서 실기로 맞춘 값이다.
// ⚠️ 스토어 액션은 구독이 아니라 getState() 로 읽는다: zustand 액션 참조는 스토어 생성 시 한 번
//    만들어진 뒤 바뀌지 않아 `useStore((s) => s.selectScene)` 과 **같은 함수**이고, 덕분에 이 헬퍼가
//    컴포넌트 밖 순수 모듈로 남는다(새 navigation context·hook 을 만들지 않는다).

import { useStore } from '../store';

/**
 * 그 장면을 선택하고 장면 탭으로 전환한 뒤 카드가 화면 가운데 오도록 스크롤한다(내 화면에만 적용 —
 * 협업자의 스크롤 위치는 건드리지 않는다).
 */
export function jumpToScene(id: string) {
  if (!id) return;
  const { selectScene, setActiveTab } = useStore.getState();
  selectScene(id);
  setActiveTab('scenes');
  requestAnimationFrame(() => {
    const el = document.getElementById(`scene-${id}`);
    if (!el) return;
    // content-visibility 플레이스홀더(320px 추정치)가 실제 카드(700~900px)로 렌더되며 매 프레임
    // 레이아웃이 밀리므로, 한 번만 스크롤하면 목표보다 한참 못 미친 위치에 멈춘다. 위치가
    // 연속 2프레임 안정될 때까지(또는 최대 40프레임) instant 스크롤을 반복해 "정착"시킨다.
    let lastTop: number | null = null;
    let stableCount = 0;
    let frame = 0;
    const tick = () => {
      el.scrollIntoView({ block: 'center' });
      const top = el.getBoundingClientRect().top;
      if (lastTop !== null && Math.abs(top - lastTop) < 1) {
        stableCount += 1;
      } else {
        stableCount = 0;
      }
      lastTop = top;
      frame += 1;
      if (stableCount >= 2 || frame >= 40) return;
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * 현재 선택 장면 **다음**의 표시 대상 장면(끝까지 없으면 처음으로 wrap). 없으면 null.
 *
 * ⚠️ 새 cursor/current-issue state 를 만들지 않는다 — jumpToScene 이 `selectedSceneId` 를 갱신하므로
 * 연속으로 누르면 자연히 다음 항목으로 넘어간다(기존 selection state 하나를 그대로 쓴다).
 * 현재 장면이 유일한 대상이면 그 자리에 머문다(k 가 한 바퀴를 다 돌아 자기 자신에 도달).
 */
export function nextFlaggedSceneId(
  orderedIds: string[],
  flagged: Set<string>,
  currentId: string | null,
): string | null {
  if (!flagged.size || !orderedIds.length) return null;
  const start = currentId ? orderedIds.indexOf(currentId) : -1;
  for (let k = 1; k <= orderedIds.length; k++) {
    const id = orderedIds[(start + k + orderedIds.length) % orderedIds.length];
    if (flagged.has(id)) return id;
  }
  return null;
}
