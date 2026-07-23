import { describe, it, expect } from 'vitest';
import { localeToTypecastLanguage, errorMessageForStatus } from '../src/generators/voice/typecastProvider';

describe('localeToTypecastLanguage', () => {
  it('Novel-Agent Locale(ko/en/ja)을 Typecast ISO 639-3 코드로 매핑한다', () => {
    expect(localeToTypecastLanguage('ko')).toBe('kor');
    expect(localeToTypecastLanguage('en')).toBe('eng');
    expect(localeToTypecastLanguage('ja')).toBe('jpn');
  });
});

describe('errorMessageForStatus', () => {
  it('401은 키 오류 메시지를 반환한다', () => {
    expect(errorMessageForStatus(401)).toMatch(/키가 올바르지 않습니다/);
  });

  it('402는 크레딧 부족 메시지를 반환한다(store.ts 의 배치 중단 가드가 이 문자열을 매칭)', () => {
    expect(errorMessageForStatus(402)).toMatch(/크레딧이 부족/);
  });

  it('404는 보이스를 찾을 수 없다는 메시지를 반환한다', () => {
    expect(errorMessageForStatus(404)).toMatch(/찾을 수 없습니다/);
  });

  it('422는 요청 형식 오류 메시지를 반환한다', () => {
    expect(errorMessageForStatus(422)).toMatch(/형식이 올바르지 않습니다/);
  });

  it('429는 레이트 리밋 메시지를 반환한다(store.ts 재시도 가드가 이 문자열을 매칭)', () => {
    expect(errorMessageForStatus(429)).toMatch(/레이트 리밋/);
  });

  it('그 외 상태코드는 응답 바디 메시지를 포함한다', () => {
    expect(errorMessageForStatus(500, '서버 내부 오류')).toMatch(/서버 내부 오류/);
  });

  it('바디 메시지가 없으면 HTTP 상태코드를 포함한 일반 메시지를 반환한다', () => {
    expect(errorMessageForStatus(500)).toMatch(/HTTP 500/);
  });
});
