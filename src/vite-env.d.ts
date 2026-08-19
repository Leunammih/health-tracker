/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

// Build stamp + short git SHA, injected by vite.config.ts. Shown in Settings so a
// "did the refresh actually do anything?" question has an answer.
declare const __BUILD_ID__: string

declare module 'sql.js/dist/sql-wasm.wasm?url' {
  const url: string
  export default url
}

declare module 'zxing-wasm/reader/zxing_reader.wasm?url' {
  const url: string
  export default url
}
