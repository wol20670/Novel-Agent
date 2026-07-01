// 렌더 중 예외가 나면 앱 전체가 하얗게 날아가(=화면 "튕김") 원인을 알 수 없다.
// 이 경계로 예외를 잡아 스택을 화면에 그대로 보여준다 — 사용자가 캡처해 보고할 수 있게.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 콘솔에도 남긴다(스택 추적용).
    console.error('[Novel-Agent] 렌더 오류:', error, info.componentStack);
    this.setState({ info });
  }

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="h-full overflow-auto p-6 text-sm text-gray-200 bg-panel">
        <h1 className="text-lg font-bold text-rose-500 mb-2">⚠ 화면 렌더 중 오류가 발생했습니다</h1>
        <p className="text-gray-400 mb-4">
          아래 내용을 캡처해 알려주시면 원인을 고칠 수 있습니다. 작업물은 IndexedDB/localStorage 에
          그대로 남아 있으니 새로고침하면 대개 복구됩니다.
        </p>
        <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 text-rose-300 mb-3">
          {error.message}
        </pre>
        {error.stack && (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-[11px] text-gray-400 mb-3">
            {error.stack}
          </pre>
        )}
        {info?.componentStack && (
          <pre className="whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 text-[11px] text-gray-500">
            {info.componentStack}
          </pre>
        )}
        <button className="btn-primary mt-4" onClick={() => location.reload()}>
          새로고침
        </button>
      </div>
    );
  }
}
