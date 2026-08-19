import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zaremy.inspo',
  appName: 'Inspo',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    // Screenshots are the whole product; never let the webview bounce-scroll them.
    scrollEnabled: true,
  },
  server: {
    // Local-first: no remote origin, ever.
    androidScheme: 'https',
  },
}

export default config
