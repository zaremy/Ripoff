import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.zaremy.inspo',
  appName: 'Teardown',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    // The wall is a long scroll of screenshots, so the webview owns scrolling;
    // contentInset 'never' above is what stops it insetting under the bars.
    scrollEnabled: true,
  },
  server: {
    // Local-first: no remote origin, ever.
    androidScheme: 'https',
  },
}

export default config
