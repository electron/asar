import type { Reporter, TestModule, TestRunEndReason } from 'vitest/node';

export default class ElectronExitReporter implements Reporter {
  onTestRunEnd(
    _testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<unknown>,
    reason: TestRunEndReason,
  ) {
    if (!process.versions.electron) {
      return;
    }

    const hasFailures = reason === 'failed';
    const hasExecutionErrors = unhandledErrors && unhandledErrors.length > 0;
    const exitCode = hasFailures || hasExecutionErrors ? 1 : 0;

    // In Electron, vitest calls process.exit() after onTestRunEnd with its own
    // exit code. Override process.exit so our exit code takes precedence on failure.
    if (exitCode !== 0) {
      const originalExit = process.exit;
      process.exit = ((_code?: number) => {
        originalExit.call(process, exitCode);
      }) as never;
    }
  }
}
