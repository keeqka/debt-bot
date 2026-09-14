import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, any uncaught render error unmounts the whole React tree —
 * a blank white screen with no way back in, and no error visible to us
 * either. Catches it, shows the message (this is an internal 2-person tool,
 * not a public product, so a raw error string is fine to surface), and
 * offers a reload instead of a dead end.
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
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background p-6 text-center">
          <AlertTriangle className="text-status-red h-8 w-8" />
          <div className="space-y-1">
            <p className="font-semibold">Что-то сломалось</p>
            <p className="text-muted-foreground max-w-xs text-sm break-words">{this.state.error.message}</p>
          </div>
          <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
        </div>
      )
    }
    return this.props.children
  }
}
