export function teardown() {
  // Vitest lets the process exit naturally, but with Electron we stay
  // alive unless explicitly told to exit, so on teardown quite Electron
  if (process.versions.electron && !process.env.ELECTRON_RUN_AS_NODE) {
    const { app } = require('electron');
    app.quit();
  }
}
