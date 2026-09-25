import { useState } from 'react';
import { useStore } from '../store';
import { hasEnvCredentials } from '../collab';
import Spinner from './Spinner';

/**
 * 부팅 관문(S1-B) — 로그인 폼 + "로컬 전용으로 계속".
 *
 * ⚠️ 계정 생성 UI 는 없다. 계정은 Supabase Dashboard 초대(invite)로만 만들어진다.
 * ⚠️ env 유무와 무관하게 항상 표시한다 — Supabase 설정이 없다는 사실을 새로운 "자동 local-only
 *    진입 조건"으로 삼지 않는다. 그 경우 로그인 UI 만 비활성화하고 상태를 명확히 보여준다.
 * ⚠️ auth callback 을 처리할 수 없는 상태(auth-unavailable)에서도 조용히 local-only 로 떨어지지
 *    않는다. 사용자가 "로컬 전용으로 계속"을 **명시적으로** 골랐을 때만 그 callback 을 포기한다
 *    (enterLocalOnly 가 callback marker 를 sanitize 한다).
 */
export default function StartGate() {
  const authPhase = useStore((s) => s.authPhase);
  const authError = useStore((s) => s.authError);
  const authBusy = useStore((s) => s.authBusy);
  const signIn = useStore((s) => s.signIn);
  const enterLocalOnly = useStore((s) => s.enterLocalOnly);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const envReady = hasEnvCredentials();
  const unavailable = authPhase === 'auth-unavailable';
  const canSubmit = envReady && !unavailable && !authBusy && !!email.trim() && !!password;

  const submit = () => {
    if (!canSubmit) return;
    void signIn(email.trim(), password);
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-panel/30">
      <div className="w-full max-w-[380px] flex flex-col gap-4">
        <div className="flex items-center gap-2 justify-center">
          <span className="text-2xl">🎬</span>
          <span className="text-accent font-bold text-xl tracking-tight">Novel-Agent</span>
        </div>
        <p className="text-[11px] text-gray-500 text-center leading-snug">
          Ren&apos;Py 비주얼노벨 제작 보조 — 협업을 쓰려면 로그인하고, 혼자 작업하려면 로컬 전용으로
          계속하세요. <b className="text-gray-400">로컬 전용에서도 모든 편집·내보내기 기능을 씁니다.</b>
        </p>

        {authError && (
          <div className="text-[11px] text-rose-500 border border-rose-500/40 rounded-lg px-3 py-2 leading-snug">
            ⚠️ {authError}
          </div>
        )}

        <section className="flex flex-col gap-2">
          <input
            className="field text-xs"
            type="email"
            autoComplete="username"
            placeholder="이메일"
            value={email}
            disabled={!envReady || unavailable}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="field text-xs"
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            value={password}
            disabled={!envReady || unavailable}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
            {authBusy ? <Spinner /> : '로그인'}
          </button>
          {!envReady && (
            <p className="text-[11px] text-amber-600 leading-snug">
              ⚠️ 이 빌드에는 Supabase 설정이 없습니다 — 로그인·협업을 쓸 수 없습니다(배포 시 환경변수
              필요). 로컬 전용으로는 정상 동작합니다.
            </p>
          )}
          <p className="text-[10px] text-gray-600 leading-snug">
            계정은 관리자 초대로만 만들어집니다(가입 화면이 없습니다).
          </p>
        </section>

        <div className="relative flex items-center gap-2 text-[10px] text-gray-600">
          <span className="flex-1 h-px bg-edge" />
          또는
          <span className="flex-1 h-px bg-edge" />
        </div>

        <button className="btn-ghost" onClick={enterLocalOnly}>
          로컬 전용으로 계속
        </button>
        <p className="text-[10px] text-gray-600 text-center leading-snug">
          나중에 왼쪽 패널의 &quot;🔐 로그인 / 협업 사용하기&quot;로 돌아올 수 있습니다.
        </p>
      </div>
    </div>
  );
}
