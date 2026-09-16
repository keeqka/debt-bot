import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Mascot } from '@/components/Mascot'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Без этого любая необработанная ошибка рендера размонтирует всё дерево —
 * пустой экран без выхода и без видимой нам ошибки. Ловим, показываем
 * сообщение и даём перезагрузиться.
 *
 * Фон тёмный намеренно: раньше здесь был bg-background (белый), то есть крэш
 * выглядел как «приложение подменили».
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render crashed:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-hf-bg p-6 text-center">
          <div className="h-[130px] w-[104px]">
            <Mascot expression="alert" />
          </div>
          <div className="space-y-1.5">
            <p className="text-[15px] font-medium text-hf-text">Что-то сломалось</p>
            <p className="max-w-xs text-[13px] leading-relaxed break-words text-hf-text-3">
              {this.state.error.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-[14px] bg-hf-accent px-6 py-3 text-sm font-medium text-white"
          >
            Перезагрузить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
