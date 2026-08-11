import { memo } from 'react';
import { useStore } from '../../store';

/**
 * 스토리 입력 textarea — project.rawInput 만 구독하는 별도(memo) 컴포넌트로 격리했다. 3000줄
 * 대본을 붙여넣으면 컨트롤드 인풋이라 매 키 입력마다 project 가 새 객체가 되는데, 부모(LeftPanel)가
 * project 를 통째로 구독했다면 좌측 패널 전체(+협업 설정 등)가 함께 리렌더됐다. 이 컴포넌트 자신은
 * 여전히 매 키 입력마다 리렌더된다(컨트롤드 인풋이라 불가피) — 그 범위를 여기로 한정하는 게 목적.
 * 로컬 state로 바꾸고 blur 시에만 커밋하는 방식은 쓰지 않는다 — blur 없이 탭을 벗어나면 방금 붙여넣은
 * 대본이 그대로 유실될 수 있어(자동저장이 못 봄) 매 키 입력 커밋을 유지해야 안전하다.
 */
const StoryTextarea = memo(function StoryTextarea() {
  const rawInput = useStore((s) => s.project.rawInput);
  const setRawInput = useStore((s) => s.setRawInput);
  return (
    <textarea
      className="field font-mono text-xs leading-relaxed h-60 resize-y"
      placeholder={'장면: 맑은 아침, 운동장\n배경: 학교 운동장\n주인공: 안녕!\n(잠시 침묵이 흘렀다.)\n선택지:\n> 인사한다\n> 지나친다'}
      value={rawInput}
      onChange={(e) => setRawInput(e.target.value)}
    />
  );
});

export default StoryTextarea;
