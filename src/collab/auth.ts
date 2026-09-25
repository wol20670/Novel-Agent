// Supabase Auth(email/password) 얇은 래퍼 — S1-B.
//
// 이 모듈의 책임은 "Auth API 를 유일한 source of truth 로 삼아 normalized event 를 내보내는 것"
// 까지다. zustand store 를 **import 하지 않는다** — store mirror/phase 정리는 store/authSlice.ts 가
// 소유한다(lifecycle owner 는 한 곳).
//
// ⚠️ 이 파일이 절대 하지 않는 것:
//  · signUp wrapper (public signup 없음 — 계정은 Dashboard invite 로만 만든다)
//  · access/refresh token 값을 읽거나 변수·상태·localStorage 에 복제하거나 로그에 남기는 것
//  · Supabase 내부 auth storage('na-auth') 를 직접 getItem 하는 것
//  · admin / service_role API 사용
// 밖으로 내보내는 세션 정보는 userId·email 둘뿐이다(session 객체를 통째로 넘기지 않는다).

import { getSupabaseClient } from './supabaseClient';

export type AuthEvent =
  | { kind: 'session'; userId: string; email: string | null }
  | { kind: 'signed-out' };

/** app-lifetime singleton — StrictMode 로 두 번 불려도 listener 를 한 번만 등록한다. */
let bootstrapPromise: Promise<void> | null = null;
/**
 * 직전에 관측한 session 의 userId. **Auth API 를 대체하는 source of truth 가 아니다** —
 * getAuthSession() 이 source of truth 이고, 이 값은 그 await 사이에 SIGNED_OUT 이 끼어든 경우를
 * 막는 **동기 race guard** 로만 쓴다(collab/index.ts enableCollabIfAuthenticated).
 * 또한 "session 이 실제로 바뀌었는지" 판정 기준이기도 하다 — TOKEN_REFRESHED/USER_UPDATED 처럼
 * 같은 세션의 반복 event 로 재접속이 트리거되지 않게 한다(event 이름으로 판정하지 않는다).
 */
let lastUserId: string | null = null;
// listener 가 초기 상태를 이미 확정했는지 — 부팅 seed 확인이 같은 결론을 두 번 내보내지 않게 한다.
// ⚠️ 이건 부팅 seed 전용 플래그다. 실제 SIGNED_OUT event 의 cleanup 을 건너뛰는 데 쓰지 말 것.
let emittedOnce = false;

export function currentAuthUserId(): string | null {
  return lastUserId;
}

/**
 * Auth listener 를 한 번 등록하고 초기 세션을 확인한다.
 *
 * ⚠️ onAuthStateChange 콜백 안에서는 **pure local synchronous work 만** 한다 — Supabase API
 * (getSession/getUser/DB/Storage/Realtime)를 호출하거나 await 하면 deadlock 위험이 있다.
 * 콜백은 event/session 에서 userId·email 만 뽑아 normalized event 를 동기 전달하고 끝난다.
 * async follow-up(협업 재접속·Realtime teardown 등)은 호출부가 콜백 밖에서 수행한다.
 */
export function bootstrapAuth(on: (e: AuthEvent) => void): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    const supabase = await getSupabaseClient();
    if (!supabase) return; // env 없음 — 호출부가 auth-unavailable 로 처리한다.

    const emit = (userId: string | null, email: string | null): void => {
      emittedOnce = true;
      if (!userId) {
        // ⚠️ lastUserId 가 이미 null 이어도 cleanup 을 **생략하지 않는다** — 실제 SIGNED_OUT event 는
        //    항상 상태를 확정해야 하고, 수신측 cleanup 은 반복 호출에 안전한 idempotent 연산이다.
        lastUserId = null;
        on({ kind: 'signed-out' });
        return;
      }
      if (userId === lastUserId) return; // 같은 세션의 refresh/update — mirror 유지, 재발행 없음
      lastUserId = userId;
      on({ kind: 'session', userId, email });
    };

    // 구독은 **의도적으로 앱 생애주기 내내 유지한다** — 해제 handle 을 들고 있지 않다.
    // 이 리스너가 죽으면 다른 탭·기기에서의 로그아웃이나 토큰 갱신을 놓치고, 그때 collab runtime 이
    // 열린 채 남는다. bootstrapPromise 싱글턴이 중복 등록을 막으므로 해제할 이유도 없다.
    supabase.auth.onAuthStateChange((_event, session) => {
      emit(session?.user?.id ?? null, session?.user?.email ?? null);
    });

    // listener 가 INITIAL_SESSION 을 아직 안 보냈을 때만 초기 상태를 확정한다(부팅을 결정적으로).
    // ⚠️ 이미 보냈으면 건드리지 않는다 — 같은 '세션 없음' 결론을 두 번 내보내지 않기 위한 것이고,
    //    실제 SIGNED_OUT event 의 cleanup 을 막는 가드가 아니다(위 emit 참고).
    const seeded = await getAuthSession();
    if (!emittedOnce) emit(seeded?.userId ?? null, seeded?.email ?? null);
  })();
  return bootstrapPromise;
}

/**
 * 현재 세션 — collab 활성화 게이트의 **source of truth**.
 * 조회 자체가 실패하면 fail-closed 로 null(=활성화하지 않음)을 돌려준다. 여기서 throw 하면
 * 게이트 호출부가 예외 처리로 갈리는데, 게이트의 안전한 기본값은 "켜지 않는다" 하나다.
 */
export async function getAuthSession(): Promise<{ userId: string; email: string | null } | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.warn('[auth] 세션 조회 실패(협업을 켜지 않는다):', error.message);
    return null;
  }
  const user = data.session?.user;
  return user?.id ? { userId: user.id, email: user.email ?? null } : null;
}

/** 로그인. 실패는 Supabase AuthError 를 그대로 throw 한다(호출부가 visible error 로 표시). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('이 빌드에는 Supabase 접속 정보가 없습니다.');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * 이 기기(브라우저)의 세션만 종료한다 — `scope: 'local'`.
 * ⚠️ 전역 로그아웃을 쓰면 같은 계정으로 다른 PC 에서 작업 중인 세션까지 끊어진다(요구사항 위반).
 * 실패는 throw 한다 — 실패를 성공처럼 처리해 화면을 signed-out 으로 바꾸면, 세션이 실제로 살아
 * 있는데도 로그아웃된 것처럼 보이는 거짓 상태가 된다. 화면 전이는 실제 SIGNED_OUT event 가 맡는다.
 */
export async function signOutLocal(): Promise<void> {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('이 빌드에는 Supabase 접속 정보가 없습니다.');
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;
}

/**
 * 비밀번호 설정/변경 — invite 완료 화면이 쓴다. 실패는 throw(호출부가 password-setup 상태를 유지).
 * ⚠️ admin API 를 쓰지 않는다. 토큰을 직접 다루지도 않는다 — 이미 수립된 세션 위에서 동작한다.
 */
export async function updatePassword(password: string): Promise<void> {
  const supabase = await getSupabaseClient();
  if (!supabase) throw new Error('이 빌드에는 Supabase 접속 정보가 없습니다.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Auth callback URL — 탐지 · 포기(sanitize)
//
//  ⚠️ 여기서 하는 일은 **marker key 존재 확인 + non-secret `type` 값 판정**뿐이다.
//     access_token/refresh_token 의 **값을 읽지 않는다**(`.get('access_token')` 금지).
//     세션 수립은 전부 SDK 의 detectSessionInUrl 에 맡긴다 — 토큰을 직접 파싱하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이 앱이 auth callback 으로 인식하는 marker key — **detector 와 sanitizer 가 공유하는 단일 목록**이다.
 * 두 곳이 갈리면 "탐지는 되는데 지우지 못하는 key" 가 생겨 local-only 선택이 영구히 무시된다.
 *
 * 근거는 아래 success/failure 각각에 적었다. marker 는 **hash(#)** 에만 실린다 — PKCE/query 형태는
 * 관측되지도 upstream 계약에 해당하지도 않아 추측으로 넣지 않는다.
 * ⚠️ 단독 `type` 처럼 일반적인 key 하나만으로 callback 이라고 판정하지 않는다(아래 조합 참고).
 */
const CALLBACK_KEYS = {
  /**
   * 성공 callback — Supabase implicit flow 가 fragment 에 싣는 key.
   * 확정 근거(2026-09-25): hosted invite verify 링크에서 `type=invite` · `redirect_to=` 사이트 루트를
   * 실측했고, 성공 redirect 형태는 현재 Supabase Auth upstream 의 GET /verify 계약
   * (`#access_token=…&refresh_token=…&type=invite`)을 따른다. 직접 hosted success fragment 캡처는
   * 1회용 메일 링크가 먼저 소모돼(otp_expired ×3) 재현하지 못했다 — 실제 배포 동작은 hosted smoke #8
   * (초대 → 비밀번호 설정 → 로그아웃 → 재로그인)에서 재검증한다.
   * `sb` 는 실패 callback 에서 실측된 Supabase marker 라 sanitize 대상에 함께 둔다.
   */
  success: {
    /** 이 조합 중 하나가 **전부** 있어야 성공 callback 으로 판정한다(단독 `type` 으로는 판정하지 않는다). */
    markers: [['access_token', 'type']],
    /** sanitize 가 지우는 전체 key. */
    all: ['access_token', 'refresh_token', 'expires_at', 'expires_in', 'token_type', 'type', 'sb'],
  },
  /**
   * 실패 callback — **hosted invite probe A 실측값**(2026-09-25, 만료된 invite 링크):
   *   `https://novel-agent-pink.vercel.app/#error=…&error_code=otp_expired&error_description=…&sb`
   *   → 사이트 루트로 돌아오고, marker 는 **hash(#)** 에만 실린다(query 없음).
   */
  failure: {
    /** `error_code` 단독, 또는 `error` + `error_description`. 단독 `error` 하나로는 판정하지 않는다. */
    markers: [['error_code'], ['error', 'error_description']],
    all: ['error', 'error_code', 'error_description', 'sb'],
  },
} as const;

/** marker 조합 중 하나라도 key 가 **전부** 있는지 — 존재만 보고 값은 읽지 않는다. */
function hasMarkerSet(h: URLSearchParams, sets: readonly (readonly string[])[]): boolean {
  return sets.some((set) => set.every((k) => h.has(k)));
}

function hashParams(): URLSearchParams {
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

/**
 * 지금 URL 이 Supabase auth callback 인지. **이 판정은 na_local_only 보다 우선한다.**
 * key 존재만 본다 — 값은 읽지 않는다.
 * ⚠️ marker 는 **hash(#)** 에서만 찾는다 — hosted probe A 에서 invite 링크가 사이트 루트의 fragment
 *    로 돌아오고 query 는 비어 있음을 실측했다. 실측하지 않은 query(PKCE) 형태를 추측으로 넣지 않는다.
 */
export function isAuthCallbackUrl(): boolean {
  try {
    const h = hashParams();
    // ⚠️ key 를 여기서 따로 적지 않는다 — sanitizer 와 같은 CALLBACK_KEYS 정의를 쓴다.
    return hasMarkerSet(h, CALLBACK_KEYS.success.markers) || hasMarkerSet(h, CALLBACK_KEYS.failure.markers);
  } catch {
    return false;
  }
}

/**
 * callback 의 **비밀이 아닌 종류 표시**(`type`)만 돌려준다 — 예: 'invite'.
 * ⚠️ 토큰 값이 아니다. 이 값으로 "비밀번호 설정이 필요한 진입"인지 판정한다.
 */
export function authCallbackType(): string | null {
  try {
    return hashParams().get('type');
  } catch {
    return null;
  }
}

/** callback 이 실패(만료·무효)임을 URL 이 이미 말해주는 경우의 사용자 표시용 사유. */
export function authCallbackError(): string | null {
  try {
    const h = hashParams();
    const code = h.get('error_code') ?? h.get('error');
    if (!code) return null;
    // 실측된 대표 사유는 한국어로 풀어 준다(Supabase 원문은 영어라 사용자가 알아보기 어렵다).
    if (code === 'otp_expired') return '초대(인증) 링크가 만료되었거나 이미 사용되었습니다. 새 초대를 요청하세요.';
    return h.get('error_description') ?? `인증 링크 오류: ${code}`;
  } catch {
    return null;
  }
}

/**
 * 현재 document URL 에서 **알려진 callback marker key 만** 지운다(history.replaceState).
 * 토큰 값을 읽거나 복제하지 않고, 그 key 를 URLSearchParams 에서 삭제할 뿐이다.
 *
 * 호출 지점은 **사용자가 명시적으로 그 callback 을 넘어서는 terminal action** 뿐이다(§6-2 2-A,
 * SDK 존재 여부와 무관):
 *  · callback 화면(auth-unavailable·실패)에서 "로컬 전용으로 계속"을 고른 경우 — enterLocalOnly
 *  · 실패한 callback 화면에서 로그인에 성공한 경우 — signIn
 * 이 sanitize 가 없으면 새로고침마다 stale marker 때문에 callback 이 또 우선해서
 * 사용자의 선택이 영구히 유지되지 못한다.
 *
 * ⚠️ callback/session 처리가 끝나기 **전에** 부르지 말 것(SDK 가 URL 을 아직 읽어야 한다).
 * ⚠️ **SDK completion 뒤(bootAuth 의 success/failure 분기)에는 부르지 않는다.** SDK 가 marker 를
 *    스스로 지우는지는 배포 후 probe B 로 확인하고(§6-2 2-B), 남기는 경우에만 그 분기에 추가한다.
 */
export function sanitizeAuthCallbackUrl(): void {
  try {
    const all = [...CALLBACK_KEYS.success.all, ...CALLBACK_KEYS.failure.all];
    const h = hashParams();
    let touched = false;
    for (const k of all) {
      if (h.has(k)) {
        h.delete(k);
        touched = true;
      }
    }
    if (!touched) return;
    // query 는 건드리지 않는다(marker 가 실리지 않는 곳이다) — 기존 search 를 그대로 보존한다.
    const hs = h.toString();
    const next = `${window.location.pathname}${window.location.search}${hs ? `#${hs}` : ''}`;
    window.history.replaceState(null, '', next);
  } catch {
    /* ignore — sanitize 실패가 부팅을 막지는 않는다 */
  }
}
