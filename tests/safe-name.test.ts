import { describe, it, expect } from 'vitest';
import { sanitizeAscii, sanitizeWindowsPath } from '../src/project/safeName';

describe('safeName: 파일/폴더명 안전화 (ZIP 파일명용 vs OS 폴더명용, 서로 다른 문자 클래스)', () => {
  describe('sanitizeAscii — [^\\w가-힣-]+ 밖은 전부 _', () => {
    it('한글은 그대로 보존된다', () => {
      expect(sanitizeAscii('나의 비주얼노벨', 40, 'fallback')).toBe('나의_비주얼노벨');
    });

    it('윈도우 예약문자 등 특수문자는 _ 로 뭉개진다', () => {
      expect(sanitizeAscii('제목:부제/편<1>', 40, 'fallback')).toBe('제목_부제_편_1_');
    });

    it('공백·구두점 연속은 _ 하나로 합쳐진다', () => {
      expect(sanitizeAscii('a   b!!!c', 40, 'fallback')).toBe('a_b_c');
    });

    it('최대 길이로 잘린다', () => {
      const long = 'a'.repeat(50);
      expect(sanitizeAscii(long, 10, 'fallback')).toBe('a'.repeat(10));
    });

    it('빈 입력이면 fallback 을 정제해 사용한다', () => {
      expect(sanitizeAscii('', 40, 'novel-project')).toBe('novel-project');
    });
  });

  describe('sanitizeWindowsPath — 윈도우 금지문자(\\/:*?"<>|)만 제거, 나머지는 보존', () => {
    it('한글은 그대로 보존된다', () => {
      expect(sanitizeWindowsPath('나의 비주얼노벨', 40, 'fallback')).toBe('나의_비주얼노벨');
    });

    it('윈도우 예약문자는 제거되고(치환 아님), 다른 특수문자는 남는다', () => {
      expect(sanitizeWindowsPath('제목:부제/편<1>', 40, 'fallback')).toBe('제목부제편1');
    });

    it('공백·언더스코어 연속은 _ 하나로 합쳐지고 앞뒤 _ 는 제거된다', () => {
      expect(sanitizeWindowsPath('  a   b__c  ', 40, 'fallback')).toBe('a_b_c');
    });

    it('최대 길이로 잘린다', () => {
      const long = 'a'.repeat(50);
      expect(sanitizeWindowsPath(long, 10, 'fallback')).toBe('a'.repeat(10));
    });

    it('빈 입력(또는 정제 후 빈 결과)이면 fallback을 사용한다', () => {
      expect(sanitizeWindowsPath('', 40, 'visual-novel')).toBe('visual-novel');
      expect(sanitizeWindowsPath('   ', 40, 'visual-novel')).toBe('visual-novel');
      expect(sanitizeWindowsPath(':::', 40, 'visual-novel')).toBe('visual-novel');
    });
  });
});
