import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  error: Error | null
}

// Without this, an uncaught render error unmounts the whole tree — a blank page
// with no clue what happened. This shows the actual error instead.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('App crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex min-h-full max-w-2xl flex-col gap-3 p-6 text-white">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-ink-300">
          The app hit an unexpected error and stopped. Your data is safe — nothing was lost. Details
          below (please share this with the developer):
        </p>
        <pre className="whitespace-pre-wrap rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <button className="btn-primary" onClick={() => location.reload()}>
          Reload app
        </button>
      </div>
    )
  }
}
