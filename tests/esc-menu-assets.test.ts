// matchEscImageFile 파일명 자동 매칭 — 사용자의 실제 업로드 파일명(23종) 기준.
// ESC 메뉴는 메인/퀵메뉴(슬롯×상태 격자)와 달리 역할(EscImageId) 하나짜리 평평한 맵이라 슬롯·상태
// 두 축을 따로 매칭하지 않는다 — 그래서 매칭 실패는 "그 파일명이 어느 키워드에도 안 걸림" 하나뿐이다.
// 그래도 quickMenuAssets.test.ts 와 같은 이유로 몇몇 케이스는 명시적으로 짚는다:
//  - '선택버튼_선택'은 '선택버튼_기본'과 앞부분(선택버튼)이 겹치지만 키워드 자체가 상태까지 포함한
//    통짜 문자열이라 choice_idle 로 새지 않고 choice_selected 로 정확히 갈린다.
//  - '저장슬롯_기본'은 '갤러리슬롯_기본'과 뒷부분(기본)이 겹치지만 마찬가지로 save_idle 로 정확히 갈린다.
//  - '종료버튼_기본'은 '좌측메뉴_기본'과 뒷부분(기본)이 겹치지만 popup_btn_idle 로 정확히 갈린다.

import { describe, expect, it } from 'vitest';
import { matchEscImageFile, type EscImageId } from '../src/types';

/** 사용자의 실제 업로드 파일명 23종 → 기대 EscImageId(ESC_IMAGES 표시 순서와 동일). */
const REAL_FILES: { file: string; id: EscImageId }[] = [
  { file: 'GUI_ESC_공통배경.png', id: 'bg' },
  { file: 'GUI_좌측메뉴_기본.png', id: 'nav_idle' },
  { file: 'GUI_좌측메뉴_마우스오버.png', id: 'nav_hover' },
  { file: 'GUI_좌측메뉴_선택.png', id: 'nav_selected' },
  { file: 'GUI_콘텐츠카드_9slice.png', id: 'card' },
  { file: 'GUI_선택버튼_기본.png', id: 'choice_idle' },
  { file: 'GUI_선택버튼_마우스오버.png', id: 'choice_hover' },
  { file: 'GUI_선택버튼_선택.png', id: 'choice_selected' },
  { file: 'GUI_선택버튼_비활성화.png', id: 'choice_disabled' },
  { file: 'GUI_슬라이더_트랙.png', id: 'slider_track' },
  { file: 'GUI_슬라이더_채움.png', id: 'slider_fill' },
  { file: 'GUI_슬라이더_핸들.png', id: 'slider_thumb' },
  { file: 'GUI_저장슬롯_기본.png', id: 'save_idle' },
  { file: 'GUI_저장슬롯_마우스오버.png', id: 'save_hover' },
  { file: 'GUI_저장슬롯_빈슬롯.png', id: 'save_empty' },
  { file: 'GUI_갤러리슬롯_기본.png', id: 'gallery_idle' },
  { file: 'GUI_갤러리슬롯_잠김.png', id: 'gallery_locked' },
  { file: 'GUI_스크롤바_트랙.png', id: 'scroll_track' },
  { file: 'GUI_스크롤바_핸들.png', id: 'scroll_thumb' },
  { file: 'GUI_종료팝업_배경.png', id: 'popup_bg' },
  { file: 'GUI_종료버튼_기본.png', id: 'popup_btn_idle' },
  { file: 'GUI_종료버튼_마우스오버.png', id: 'popup_btn_hover' },
  { file: 'GUI_종료버튼_선택.png', id: 'popup_btn_selected' },
];

describe('matchEscImageFile', () => {
  it('실제 업로드 파일명 23종이 각자의 역할에 1:1로 매칭된다(중복 없음)', () => {
    const claimed = new Set<EscImageId>();
    for (const { file, id } of REAL_FILES) {
      const matched = matchEscImageFile(file);
      expect(matched, `${file} → ${id} 매칭 실패`).toBe(id);
      expect(claimed.has(matched as EscImageId), `${id} 역할이 두 번 이상 매칭됨`).toBe(false);
      claimed.add(matched as EscImageId);
    }
    expect(claimed.size).toBe(23);
  });

  it("충돌 1: '선택버튼_선택'은 '선택버튼_기본'과 앞부분이 겹치지만 choice_selected 로 정확히 갈린다", () => {
    expect(matchEscImageFile('GUI_선택버튼_선택.png')).toBe('choice_selected');
    expect(matchEscImageFile('GUI_선택버튼_기본.png')).toBe('choice_idle');
  });

  it("충돌 2: '저장슬롯_기본'은 '갤러리슬롯_기본'과 뒷부분이 겹치지만 save_idle 로 정확히 갈린다", () => {
    expect(matchEscImageFile('GUI_저장슬롯_기본.png')).toBe('save_idle');
    expect(matchEscImageFile('GUI_갤러리슬롯_기본.png')).toBe('gallery_idle');
  });

  it("충돌 3: '종료버튼_기본'은 '좌측메뉴_기본'과 뒷부분이 겹치지만 popup_btn_idle 로 정확히 갈린다", () => {
    expect(matchEscImageFile('GUI_종료버튼_기본.png')).toBe('popup_btn_idle');
    expect(matchEscImageFile('GUI_좌측메뉴_기본.png')).toBe('nav_idle');
  });

  it('ESC 이미지 역할이 아닌 파일명은 undefined', () => {
    expect(matchEscImageFile('GUI_배경_학교.png')).toBeUndefined();
    expect(matchEscImageFile('readme.txt')).toBeUndefined();
  });
});
