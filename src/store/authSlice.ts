// Supabase Auth 의 **store-side lifecycle owner**(S1-B).
//
// collab/auth.ts 는 Auth API 를 감싸 normalized event 를 내보내는 데까지만 책임지고(store 를 모른다),
// mirror/status/peers/phase 정리는 전부 이 슬라이스가 한다 — owner 를 한 곳으로 못박는다.
//
// ⚠️ token/session 객체를 state 에 보관하지 않는다. 표시용 email 뿐이다.

import {
  authCallbackError,
  authCallbackType,
  bootstrapAuth,
  currentAuthUserId,
  deactivateCollab,
  enableCollabIfAuthenticated,
  getAuthSession,
  hasEnvCredentials,
  isAuthCallbackUrl,
  isCollabActive,
  isCollabReady,
  persistCollabConfig,
  sanitizeAuthCallbackUrl,
  signInWithPassword,
  signOutLocal,
  stopCollab,
  updatePassword,
  type AuthEvent,
} from '../collab';
import type { State } from './types';
import type { SliceCreator } from './context';

/** 로그인하지 않고 로컬 전용으로 쓰겠다는 사용자 선택. ⚠️ auth callback 처리가 이보다 우선한다. */
const NA_LOCAL_ONLY = 'na_local_only';
/**
 * "invite 로 들어왔고 아직 비밀번호를 설정하지 않았다"는 **app 소유 표시**.
 * Supabase invite 는 비밀번호 설정 **전에** 세션을 먼저 만들기 때문에, 이 표시가 없으면
 * 설정 화면에서 새로고침한 순간 평범한 persisted session 으로 보여 비밀번호 설정을 영구히 건너뛴다.
 * ⚠️ 토큰 값을 저장하지 않는다. Supabase 내부 storage(na-auth)를 들여다보지도 않는다 —
 *    "invite callback 으로 들어왔다"는 app state 하나만 기록한다.
 */
const NA_PENDING_PW = 'na_pending_password_setup';
/**
 * "local-only 를 거쳐 인증 경로로 왔다 — 다음 persisted-intent 자동 재접속 **전에** 사용자 확인이
 * 필요하다"는 **app 소유 표시**(S1-B F1). 토큰·세션 정보가 아니다.
 * 없으면 local-only 에서 한 편집이 로그인 직후 자동 재접속의 pull-first 로 통째 교체된다(hosted 재현).
 * ⚠️ localStorage 에 둔다 — 로그인 화면·확인 화면에서 새로고침해도 가드가 풀리면 안 된다.
 */
const NA_RECONNECT_CONFIRM = 'na_reconnect_confirm';

const readLs = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeLs = (k: string, v: string): void => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};
const dropLs = (k: string): void => {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
};

const isLocalOnly = (): boolean => readLs(NA_LOCAL_ONLY) === '1';
const hasPendingPasswordSetup = (): boolean => readLs(NA_PENDING_PW) === '1';

/**
 * local-only preference 를 소멸시킨다. **local-only 였다면 먼저 재접속 확인 marker 를 남긴다**(F1).
 * na_local_only 가 사라지는 모든 곳은 이 helper 하나를 거친다 — 한 곳이라도 dropLs 를 직접 부르면
 * 그 경로로 들어온 로그인이 확인 없이 자동 재접속한다.
 * ⚠️ enterLocalOnly 에서는 marker 를 만들지 않는다(소멸 시점 기록만으로 충분하다).
 */
const consumeLocalOnlyPreference = (): void => {
  if (isLocalOnly()) writeLs(NA_RECONNECT_CONFIRM, '1');
  dropLs(NA_LOCAL_ONLY);
};

/**
 * 비밀번호 설정이 필요한 callback 인지 — `type` 은 토큰이 아닌 공개 marker 다.
 * 'invite' 확정 근거: hosted invite verify 링크의 `type=invite` 실측 + 현재 Supabase Auth upstream 의
 * GET /verify 성공 redirect 계약(fragment 에 `type=invite`). 직접 hosted success fragment 캡처는 1회용
 * 메일 링크 소모로 재현하지 못했고, 실제 배포 동작은 hosted smoke #8 에서 재검증한다.
 * ⚠️ 근거 없는 다른 type(예: recovery)을 비밀번호 설정 경로로 추측해 넣지 않는다.
 */
const PASSWORD_SETUP_TYPES = new Set(['invite']);

/** in-flight dedupe 전용 — **settle 후 반드시 비운다**(local-only 를 벗어날 때 재평가돼야 한다). */
let bootInFlight: Promise<void> | null = null;

/**
 * URL 이 **명시적으로 실패를 말하는** auth callback 으로 부팅했는지. true 인 동안에는 브라우저에 남아 있던
 * 무관한 기존 세션이 있어도 그 callback 을 성공으로 취급하지 않고, session event 로 authed 로 올라가지도
 * 않는다. 풀리는 곳: 새 부팅 평가 · 성공한 interactive 로그인 · 로컬 전용 선택(=callback 포기).
 */
let callbackErrorHold = false;

export const createAuthSlice: SliceCreator<
  Pick<
    State,
    | 'bootAuth'
    | 'signIn'
    | 'signOut'
    | 'completePasswordSetup'
    | 'enterLocalOnly'
    | 'leaveLocalOnly'
    | 'confirmCollabReconnect'
    | 'keepLocalSkipReconnect'
  >
> = (set, get, ctx) => {
  const { collabHooks, flash } = ctx;

  /**
   * persisted 협업 intent 자동 재접속 — **Auth API 로 session 이 확인된 뒤에만** 시도한다.
   * 이미 켜져 있으면 no-op(같은 세션의 반복 event 로 재접속이 겹치지 않는다).
   *
   * ⚠️ F1: local-only 를 거쳐 왔으면(NA_RECONNECT_CONFIRM) 자동 재접속하지 않고 사용자에게 묻는다 —
   *    startCollab 의 pull-first 가 local-only 편집을 통째 교체하기 때문이다. 가드는 **이 경계에만** 둔다
   *    (startCollab·enableCollabIfAuthenticated·명시적 방 만들기/참가의 의미는 그대로).
   */
  const maybeAutoReconnect = async (): Promise<void> => {
    if (get().authPhase !== 'authed') return;
    if (isCollabActive()) return;
    // transition barrier — authed 인데 na_local_only 가 아직 남아 있다 = SDK 의 SIGNED_IN → setTimeout 0
    // promoteSession 이 signIn continuation(consumeLocalOnlyPreference)보다 먼저 돈 짧은 틈이다.
    // 재접속은 막되 **모달은 띄우지 않는다** — canonical truth(marker)가 아직 없다. continuation 이
    // marker 를 쓴 뒤 promoteSession 을 다시 부르므로 그때 아래 분기에서 pending 이 된다.
    if (isLocalOnly()) return;
    if (!isCollabReady()) {
      // persisted intent + env + 방 코드 전제가 없다 = 확인할 재접속이 없다 → stale marker 정리.
      dropLs(NA_RECONNECT_CONFIRM);
      return;
    }
    // pending(UI mirror)은 marker(canonical truth)가 있을 때만 올린다.
    if (readLs(NA_RECONNECT_CONFIRM) === '1') {
      set({ collabReconnectPending: true });
      return;
    }
    const ok = await enableCollabIfAuthenticated(collabHooks());
    if (ok) set({ collabEnabled: true });
  };

  /** 확인된 세션을 화면 상태로 올린다(비밀번호 설정 대기면 그쪽이 우선). */
  const promoteSession = (): void => {
    const phase = get().authPhase;
    // 사용자가 명시적으로 고른 상태는 덮지 않는다.
    if (phase === 'local-only' || phase === 'auth-unavailable') return;
    // 명시적 실패 callback 으로 들어온 부팅은 무관한 기존 세션으로 성공 처리하지 않는다.
    if (callbackErrorHold) return;
    if (hasPendingPasswordSetup()) {
      if (phase !== 'password-setup') set({ authPhase: 'password-setup' });
      return; // ⚠️ 비밀번호 설정 중에는 자동 재접속을 시작하지 않는다.
    }
    if (phase !== 'authed') set({ authPhase: 'authed' });
    void maybeAutoReconnect();
  };

  /**
   * normalized auth event 처리.
   * ⚠️ 이 함수는 Supabase onAuthStateChange **콜백 스택 안에서 동기 실행**된다. 따라서 여기서
   *    허용되는 것은 pure local synchronous work 뿐이고, Supabase API 를 타는 작업
   *    (stopCollab → removeAllChannels, enableCollabIfAuthenticated → getSession 등)은 반드시
   *    next-task boundary(setTimeout 0) 뒤로 미룬다. queueMicrotask 는 쓰지 않는다 —
   *    microtask 는 Supabase auth 내부 continuation 보다 먼저 돌 수 있다.
   */
  const onAuthEvent = (e: AuthEvent): void => {
    if (e.kind === 'signed-out') {
      // ── [A] 콜백 스택 안: pure local synchronous work ──
      deactivateCollab(); // runtime gate 를 **즉시** 닫는다(이 시점 이후 remote 경로는 전부 null)
      set({
        collabEnabled: false,
        collabStatus: 'off',
        collabPeers: [],
        authPhase: 'login',
        authEmail: null,
        // 확인 모달은 내리되 NA_RECONNECT_CONFIRM marker 는 보존한다 — 재로그인하면 다시 묻는다.
        collabReconnectPending: false,
      });
      // ⚠️ persisted na_collab_enabled intent 는 지우지 않는다 — 다음 로그인의 재접속(local-only 를 거쳤다면
      //    확인 후)을 위해 보존.
      // ⚠️ local Project 와 IndexedDB 에셋도 건드리지 않는다(clearProject/clearAssets 호출 0).

      // ── [B] 콜백 반환 이후: Realtime teardown 만 미룬다 ──
      setTimeout(() => {
        // 그 사이 정상적인 auth transition 이 runtime 을 다시 켰다면 이 stale timer 가 새 협업을
        // 끊어서는 안 된다. 새 startCollab 은 이미 기존 채널을 정리하므로 여기서 skip 해도 안전하다.
        if (!isCollabActive()) stopCollab();
      }, 0);
      return;
    }

    // session — 표시용 email 만 반영하고(동기), 나머지는 콜백 밖으로 넘긴다.
    const userId = e.userId;
    set({ authEmail: e.email });
    setTimeout(() => {
      // ⚠️ freshness guard — 이 timer 가 기다리는 사이 SIGNED_OUT(또는 계정 전환)이 끼어들었으면
      //    지금은 이미 다른 상태다. 옛 session 으로 authed·재접속을 되살리지 않는다.
      if (currentAuthUserId() !== userId) return;
      promoteSession();
    }, 0);
  };

  return {
    bootAuth: () => {
      if (bootInFlight) return bootInFlight;
      bootInFlight = (async () => {
        set({ authPhase: 'booting', authError: null });
        callbackErrorHold = false; // 부팅마다 새로 평가한다

        // ── ① auth callback 은 na_local_only 보다 우선한다 ──
        if (isAuthCallbackUrl()) {
          const urlError = authCallbackError();

          if (!hasEnvCredentials()) {
            // SDK 를 로드조차 못 해 callback 을 처리할 수 없다. 조용히 local-only 로 떨어지지 않고
            // 사용자에게 보여준다(그 화면에서 local-only 를 고르면 callback 을 포기·sanitize 한다).
            set({
              authPhase: 'auth-unavailable',
              authError: urlError ?? '이 빌드에 Supabase 설정이 없어 인증 링크를 처리할 수 없습니다.',
            });
            return;
          }

          if (urlError) {
            // ── URL 이 실패를 명시했다(만료·무효 링크) ──
            // ⚠️ 브라우저에 **무관한 기존 세션**이 살아 있어도 이 callback 을 성공으로 취급하지 않는다.
            //    visible error · login · na_local_only 유지 · pending marker 는 만들지도 지우지도 않음 ·
            //    자동 재접속 없음. listener 는 등록한다 — 이 화면에서 다시 로그인할 수 있어야 한다.
            callbackErrorHold = true;
            await bootstrapAuth(onAuthEvent);
            set({ authPhase: 'login', authError: urlError });
            return;
          }

          // 세션이 수립되기 **전에** pending 표시를 먼저 기록한다 — 설정 화면에서 새로고침해도
          // 비밀번호 설정을 건너뛰지 않게(§6-1).
          const type = authCallbackType();
          if (type && PASSWORD_SETUP_TYPES.has(type)) writeLs(NA_PENDING_PW, '1');

          // 세션 수립은 전부 SDK(detectSessionInUrl)에 맡긴다 — 토큰을 직접 파싱하지 않는다.
          await bootstrapAuth(onAuthEvent);
          const session = await getAuthSession();

          if (!session) {
            // SDK 가 세션을 만들지 못했다. 이 부팅에서 우리가 만든 pending marker 만 되돌린다.
            // ⚠️ na_local_only 를 성공한 것처럼 clear 하지 않는다. local project/assets 도 그대로.
            // ⚠️ SDK completion 뒤 URL 을 app 이 추가로 sanitize 할지는 probe B 로 정한다(§6-2 2-B) —
            //    지금은 부르지 않는다. 사용자가 로컬 전용/로그인을 명시적으로 고를 때 정리된다.
            dropLs(NA_PENDING_PW);
            set({
              authPhase: 'login',
              authError: '인증 링크를 처리하지 못했습니다. 링크가 만료되었을 수 있으니 새 초대를 요청하세요.',
            });
            return;
          }

          // 성공한 callback completion — 사용자가 인증 경로로 명시적으로 들어왔다.
          consumeLocalOnlyPreference();
          set({
            authPhase: hasPendingPasswordSetup() ? 'password-setup' : 'authed',
            authEmail: session.email,
            authError: null,
          });
          if (get().authPhase === 'authed') await maybeAutoReconnect();
          return;
        }

        // ── ② local-only fast-path: Supabase import·network 0 ──
        if (isLocalOnly()) {
          set({ authPhase: 'local-only' });
          return;
        }

        // ── ③ env 가 없으면 StartGate 를 띄우되 로그인 UI 는 비활성 ──
        // (getSupabaseClient 도 env 없으면 동적 import 전에 null 을 돌려주므로 network 0 이다.)
        if (!hasEnvCredentials()) {
          set({ authPhase: 'login' });
          return;
        }

        // ── ④ 평상시 부팅 ──
        await bootstrapAuth(onAuthEvent);
        const session = await getAuthSession();
        if (!session) {
          set({ authPhase: 'login' });
          return;
        }
        set({
          authPhase: hasPendingPasswordSetup() ? 'password-setup' : 'authed',
          authEmail: session.email,
        });
        if (get().authPhase === 'authed') await maybeAutoReconnect();
      })().finally(() => {
        // ⚠️ 반드시 비운다 — leaveLocalOnly() 가 다시 부르면 state machine 을 새로 평가해야 한다.
        bootInFlight = null;
      });
      return bootInFlight;
    },

    signIn: async (email, password) => {
      set({ authBusy: true, authError: null });
      try {
        await signInWithPassword(email, password);
      } catch (e) {
        // 실패에서는 na_local_only 도 callback 상태도 건드리지 않는다(사용자 선택 보존).
        set({ authError: (e as Error).message, authBusy: false });
        return;
      }
      set({ authBusy: false });
      // 성공한 interactive 로그인은 "인증 경로로 가겠다"는 명시적 선택이므로 local-only preference 를
      // 소멸시킨다. 안 그러면 이번 화면은 authed 인데 다음 새로고침에서 local-only 로 되돌아간다.
      consumeLocalOnlyPreference();
      if (callbackErrorHold) {
        // 실패한 callback 화면에서 로그인에 성공했다 = 사용자가 **명시적으로** 그 callback 을 넘어섰다
        // (enterLocalOnly 의 포기와 같은 terminal action). 남은 marker 를 지우지 않으면 새로고침마다
        // 또 실패 화면으로 돌아간다.
        callbackErrorHold = false;
        if (isAuthCallbackUrl()) sanitizeAuthCallbackUrl();
      }
      // phase 전이는 wrapper 성공이 아니라 **Auth API 로 확인된 세션**으로 한다. 보통은 SIGNED_IN
      // event 가 먼저 올리지만, 같은 계정의 기존 세션이 남아 있던 경우엔 event 가 중복으로 걸러져
      // 오지 않으므로 여기서 한 번 확인한다(이미 올라갔으면 no-op).
      const s = await getAuthSession();
      if (s && currentAuthUserId() === s.userId) {
        set({ authEmail: s.email });
        promoteSession();
      }
    },

    signOut: async () => {
      set({ authBusy: true, authError: null });
      try {
        await signOutLocal();
      } catch (e) {
        // ⚠️ 실패를 성공처럼 처리하지 않는다 — 세션이 실제로 살아 있는데 signed-out 으로 보이면
        //    거짓 상태다. phase 를 바꾸지 않고 오류만 보여준다(local project/assets 는 당연히 보존).
        set({ authError: (e as Error).message, authBusy: false });
        return;
      }
      set({ authBusy: false });
      // cleanup 은 실제 SIGNED_OUT event 가 onAuthEvent 에서 수행한다.
    },

    completePasswordSetup: async (password) => {
      set({ authBusy: true, authError: null });
      try {
        await updatePassword(password);
      } catch (e) {
        // password-setup 상태·pending marker·na_local_only 를 모두 그대로 유지한다.
        set({ authError: (e as Error).message, authBusy: false });
        return;
      }
      set({ authBusy: false });
      dropLs(NA_PENDING_PW);
      consumeLocalOnlyPreference();
      set({ authPhase: 'authed', authError: null });
      // password setup 을 마치고 authed 로 넘어오는 이 시점에 딱 한 번 재접속을 시도한다.
      await maybeAutoReconnect();
    },

    enterLocalOnly: () => {
      // callback URL 화면(auth-unavailable·실패 callback)에서 이걸 골랐다면 "이번 callback 을
      // 포기한다"는 terminal action 이다 — marker 를 지워야 새로고침 때 또 callback 이 우선하지 않는다.
      // ⚠️ 자동 sanitize 가 아니다. 사용자가 명시적으로 이 버튼을 눌렀을 때만 포기한다.
      callbackErrorHold = false;
      if (isAuthCallbackUrl()) sanitizeAuthCallbackUrl();
      dropLs(NA_PENDING_PW);
      writeLs(NA_LOCAL_ONLY, '1');
      deactivateCollab();
      stopCollab();
      set({
        authPhase: 'local-only',
        authError: null,
        authEmail: null,
        collabEnabled: false,
        collabStatus: 'off',
        collabPeers: [],
      });
    },

    leaveLocalOnly: async () => {
      // local-only 에서 한 편집이 있을 수 있다 — 로그인 뒤 자동 재접속 대신 확인을 받도록 marker 를 남긴다.
      // (로그인 화면에서 새로고침해도 marker 는 localStorage 에 남는다.)
      consumeLocalOnlyPreference();
      // ⚠️ na_collab_enabled intent 는 지우지 않는다 — 로그인 후 재접속 확인에 쓰인다.
      // ⚠️ local Project 와 에셋도 건드리지 않는다(store 를 그대로 둔다).
      await get().bootAuth();
    },

    confirmCollabReconnect: async () => {
      // 사용자가 기존 방의 pull-first(원격이 있으면 로컬을 대체)를 **명시적으로** 승인했다.
      // marker 를 await 전에 지운다 — 도중에 로그아웃돼도 이미 내린 선택을 다시 묻지 않는다.
      dropLs(NA_RECONNECT_CONFIRM);
      set({ collabReconnectPending: false });
      const ok = await enableCollabIfAuthenticated(collabHooks());
      if (ok) set({ collabEnabled: true });
    },

    keepLocalSkipReconnect: () => {
      // "이 방에 재연결하지 않음" — 사용자의 명시적 선택을 persisted intent 에 기록한다.
      // (marker 만 지우고 intent 를 남기면 다음 새로고침에서 확인 없이 자동 재접속한다.)
      // ⚠️ local-only **진입 시** intent 를 자동으로 끄는 것과는 다르다. 방 코드·이름은 보존한다.
      // ⚠️ setCollabConfig()/stopCollab() 을 부르지 않는다 — runtime 은 켜진 적이 없고, Realtime
      //    teardown 을 포함한 remote 호출 0 · project 무수정 · 로컬을 원격에 push 하지 않음을 지킨다.
      dropLs(NA_RECONNECT_CONFIRM);
      persistCollabConfig({ enabled: false });
      set({ collabReconnectPending: false, collabEnabled: false, collabStatus: 'off', collabPeers: [] });
      flash('협업을 껐습니다 — 지금 프로젝트를 그대로 유지합니다. 공유하려면 새 방을 만드세요.');
    },
  };
};
