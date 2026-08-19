import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initTheme } from './lib/theme'
import { initAppUpdate } from './lib/appUpdate'
import './index.css'

initTheme() // apply the stored light/dark preference before first paint
initAppUpdate() // register the service worker and start watching for new builds

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
