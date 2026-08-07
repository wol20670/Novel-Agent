// matchQuickButtonFile 파일명 자동 매칭 — 사용자의 실제 업로드 파일명 기준.
// 두 충돌 케이스가 이 테스트의 핵심이다:
//  - '빠른저장'은 '저장'을 부분문자열로 포함하지만 matchLongestKeyword 가 긴 키워드부터 보므로
//    qsave 로 정확히 갈린다(save 로 새지 않음).
//  - '비활성화'는 '활성화'를 부분문자열로 포함하지만 마찬가지로 disabled 로 정확히 갈린다
//    (selected 로 새지 않음).

import { describe, expect, it } from 'vitest';
import { matchQuickButtonFile } from '../src/types';

describe('matchQuickButtonFile', () => {
  it('기록(history) 4상태', () => {
    expect(matchQuickButtonFile('GUI_기록_기본.png')).toEqual({ slot: 'history', state: 'idle' });
    expect(matchQuickButtonFile('GUI_기록_마우스오버.png')).toEqual({ slot: 'history', state: 'hover' });
    expect(matchQuickButtonFile('GUI_기록_비활성화.png')).toEqual({ slot: 'history', state: 'disabled' });
    expect(matchQuickButtonFile('GUI_기록_클릭.png')).toEqual({ slot: 'history', state: 'press' });
  });

  it("충돌 1: '빠른저장'은 '저장'의 부분문자열이지만 qsave 로 정확히 갈린다", () => {
    expect(matchQuickButtonFile('GUI_빠른저장_기본.png')).toEqual({ slot: 'qsave', state: 'idle' });
    expect(matchQuickButtonFile('GUI_저장_기본.png')).toEqual({ slot: 'save', state: 'idle' });
  });

  it('빠른불러오기(qload)', () => {
    expect(matchQuickButtonFile('GUI_빠른불러오기_비활성화.png')).toEqual({ slot: 'qload', state: 'disabled' });
  });

  it("충돌 2: '비활성화'는 '활성화'의 부분문자열이지만 disabled 로 정확히 갈린다", () => {
    expect(matchQuickButtonFile('GUI_스킵_활성화.png')).toEqual({ slot: 'skip', state: 'selected' });
    expect(matchQuickButtonFile('GUI_자동_활성화.png')).toEqual({ slot: 'auto', state: 'selected' });
  });

  it('나머지 슬롯(숨기기/설정/메뉴/뒤로)', () => {
    expect(matchQuickButtonFile('GUI_숨기기_기본.png')).toEqual({ slot: 'hide', state: 'idle' });
    expect(matchQuickButtonFile('GUI_설정_기본.png')).toEqual({ slot: 'prefs', state: 'idle' });
    expect(matchQuickButtonFile('GUI_메뉴_기본.png')).toEqual({ slot: 'menu', state: 'idle' });
    expect(matchQuickButtonFile('GUI_뒤로_기본.png')).toEqual({ slot: 'back', state: 'idle' });
  });

  it('패널 파일명은 버튼이 아니므로 매칭되지 않는다(상태 키워드가 없어 undefined)', () => {
    expect(matchQuickButtonFile('GUI_우측메뉴_패널.png')).toBeUndefined();
  });
});
