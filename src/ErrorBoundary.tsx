import React from 'react'

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#050d1a', color: '#ff2d55', fontFamily: 'monospace',
          padding: 32, height: '100vh', whiteSpace: 'pre-wrap', overflow: 'auto'
        }}>
          <div style={{ color: '#00f5d4', fontSize: 16, marginBottom: 16 }}>⬡ CYBERNET — Runtime Error</div>
          <div style={{ color: '#ff2d55', marginBottom: 8 }}>{String(this.state.error)}</div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{this.state.error.stack}</div>
        </div>
      )
    }
    return this.props.children
  }
}
