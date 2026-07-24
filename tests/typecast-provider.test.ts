import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  localeToTypecastLanguage,
  errorMessageForStatus,
  listVoices,
  recommendVoices,
  getAllVoices,
  clearVoiceCache,
} from '../src/generators/voice/typecastProvider';

/** fetch 를 1회용으로 스텁 — proxyUrl 은 절대경로가 아니라 '/api/typecast?...' 상대경로를 넘기므로
 * 호출 인자(url)를 그대로 캡처해 new URL(url, 'http://localhost') 로 파싱해서 쿼리를 검사한다. */
function stubFetchOnce(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearVoiceCache();
});

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

describe('listVoices 필터 쿼리 조립', () => {
  it('gender/age/useCase 를 각각 gender/age/use_cases 쿼리로 실어 보낸다', async () => {
    const fetchMock = stubFetchOnce([]);
    await listVoices({ model: 'ssfm-v30', gender: 'female', age: 'young_adult', useCase: 'Anime' }, 'key123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(calledUrl.searchParams.get('path')).toBe('v2/voices');
    expect(calledUrl.searchParams.get('model')).toBe('ssfm-v30');
    expect(calledUrl.searchParams.get('gender')).toBe('female');
    expect(calledUrl.searchParams.get('age')).toBe('young_adult');
    expect(calledUrl.searchParams.get('use_cases')).toBe('Anime');
  });

  it('opts 를 안 주면 필터 쿼리 없이 path 만 담아 요청한다(전체 목록)', async () => {
    const fetchMock = stubFetchOnce([]);
    await listVoices({}, 'key123');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(calledUrl.searchParams.get('path')).toBe('v2/voices');
    expect(calledUrl.searchParams.has('gender')).toBe(false);
    expect(calledUrl.searchParams.has('age')).toBe(false);
    expect(calledUrl.searchParams.has('use_cases')).toBe(false);
  });
});

describe('getAllVoices 모듈 캐시', () => {
  it('같은 apiKey 로 재호출하면 네트워크를 다시 타지 않는다(캐시 히트)', async () => {
    const fetchMock = stubFetchOnce([{ voice_id: 'tc_a', voice_name: '가' }]);
    const first = await getAllVoices('key123');
    const second = await getAllVoices('key123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toBe(first); // 같은 배열 인스턴스(같은 Promise 결과) 재사용
  });

  it('키가 바뀌면 캐시를 무효화하고 다시 fetch 한다', async () => {
    const fetchMock = stubFetchOnce([]);
    await getAllVoices('key1');
    await getAllVoices('key2');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('recommendVoices 응답 파싱', () => {
  it('정상 응답(voice_id/voice_name/score)을 점수와 함께 파싱한다', async () => {
    stubFetchOnce([
      { voice_id: 'tc_abc', voice_name: '아리아', score: 0.95 },
      { voice_id: 'tc_def', voice_name: '루나', score: 0.81 },
    ]);
    const result = await recommendVoices('밝고 씩씩한 소녀', 5, 'key123');
    expect(result).toEqual([
      { voiceId: 'tc_abc', name: '아리아', score: 0.95 },
      { voiceId: 'tc_def', name: '루나', score: 0.81 },
    ]);
  });

  it('필드명이 카멜케이스(voiceId/voiceName)나 문자열 score 로 와도 방어적으로 파싱한다', async () => {
    stubFetchOnce([{ voiceId: 'tc_xyz', voiceName: '하루', score: '0.7' }]);
    const result = await recommendVoices('query', 5, 'key123');
    expect(result).toEqual([{ voiceId: 'tc_xyz', name: '하루', score: 0.7 }]);
  });

  it('{ voices: [...] } 처럼 감싸진 응답도 파싱한다', async () => {
    stubFetchOnce({ voices: [{ voice_id: 'tc_1', voice_name: '이름', score: 0.5 }] });
    const result = await recommendVoices('q', 5, 'key');
    expect(result).toEqual([{ voiceId: 'tc_1', name: '이름', score: 0.5 }]);
  });

  it('빈 배열 응답이면 빈 배열을 반환한다', async () => {
    stubFetchOnce([]);
    const result = await recommendVoices('q', 5, 'key');
    expect(result).toEqual([]);
  });

  it('voice_id 가 없는 항목은 걸러낸다', async () => {
    stubFetchOnce([
      { voice_name: 'id 없음', score: 0.9 },
      { voice_id: 'tc_2', voice_name: '유효', score: 0.4 },
    ]);
    const result = await recommendVoices('q', 5, 'key');
    expect(result).toEqual([{ voiceId: 'tc_2', name: '유효', score: 0.4 }]);
  });

  it('query/limit 을 쿼리 파라미터로 실어 v1/voices/recommendations 에 요청한다', async () => {
    const fetchMock = stubFetchOnce([]);
    await recommendVoices('밝은 소녀', 5, 'key123');

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string, 'http://localhost');
    expect(calledUrl.searchParams.get('path')).toBe('v1/voices/recommendations');
    expect(calledUrl.searchParams.get('query')).toBe('밝은 소녀');
    expect(calledUrl.searchParams.get('limit')).toBe('5');
  });
});
