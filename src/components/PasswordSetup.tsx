import { useState } from 'react';
import { useStore } from '../store';
import Spinner from './Spinner';

/**
 * 초대(invite) 완료 화면 — 비밀번호 설정(S1-B).
 *
 * Supabase invite 링크는 비밀번호를 정하기 **전에** 세션을 먼저 만든다. 그래서 이 화면은
 * "세션은 있지만 아직 비밀번호가 없는" 상태를 다루고, 설정이 끝날 때까지 에디터·자동 협업 접속보다
 * 우선한다(authSlice 의 pending 표시). 여기서 새로고침해도 다시 이 화면으로 돌아온다.
 *
 * ⚠️ admin/service_role API 를 쓰지 않는다. 토큰을 직접 다루지도 않는다 —
 *    이미 수립된 세션 위에서 supabase.auth.updateUser({ password }) 하나만 호출한다.
 * ⚠️ 실패하면 이 화면을 그대로 유지한다(성공한 것처럼 넘어가면 비밀번호 없는 계정이 방치된다).
 */
export default function PasswordSetup() {
  const authEmail = useStore((s) => s.authEmail);
  const authError = useStore((s) => s.authError);
  const authBusy = useStore((s) => s.authBusy);
  const completePasswordSetup = useStore((s) => s.completePasswordSetup);

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  // Supabase 기본 최소 길이는 6자다. 여기서 더 강한 정책을 새로 만들지 않는다(서버 정책이 정본).
  const tooShort = pw.length > 0 && pw.length < 6;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSubmit = !authBusy && pw.length >= 6 && pw === pw2;

  const submit = () => {
    if (!canSubmit) return;
    void completePasswordSetup(pw);
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-panel/30">
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <div className="flex items-center gap-2 justify-center">
          <span className="text-2xl">🔐</span>
          <span className="text-accent font-bold text-xl tracking-tight">비밀번호 설정</span>
        </div>
        <p className="text-[11px] text-gray-500 text-center leading-snug">
          초대를 받은 계정{authEmail ? ` (${authEmail})` : ''}의 비밀번호를 정하세요. 설정한 뒤에는
          이메일과 이 비밀번호로 다시 로그인할 수 있습니다.
        </p>

        {authError && (
          <div className="text-[11px] text-rose-500 border border-rose-500/40 rounded-lg px-3 py-2 leading-snug">
            ⚠️ {authError}
          </div>
        )}

        <input
          className="field text-xs"
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호 (6자 이상)"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
        />
        <input
          className="field text-xs"
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호 확인"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {tooShort && <p className="text-[11px] text-amber-600">6자 이상으로 정해주세요.</p>}
        {mismatch && <p className="text-[11px] text-amber-600">두 입력이 서로 다릅니다.</p>}

        <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
          {authBusy ? <Spinner /> : '비밀번호 설정하고 시작'}
        </button>
      </div>
    </div>
  );
}
