import { RunnerTestFile, Task } from 'vitest';
import { Reporter } from 'vitest/reporters';

function countFailures(tasks: Task[]): number {
  let count = 0;
  for (const task of tasks) {
    if (task.result?.state === 'fail') {
      count++;
    }
    if ('tasks' in task && task.tasks) {
      count += countFailures(task.tasks);
    }
  }
  return count;
}

export default class ElectronExitReporter implements Reporter {
  onFinished(files: RunnerTestFile[], errors: unknown[]) {
    if (!process.versions.electron) {
      return;
    }

    let failureCount = 0;

    for (const file of files) {
      if (file.result?.state === 'fail') {
        failureCount++;
      }
      if (file.tasks) {
        failureCount += countFailures(file.tasks);
      }
    }

    const hasExecutionErrors = errors && errors.length > 0;
    const exitCode = failureCount > 0 || hasExecutionErrors ? 1 : 0;

    // In Electron, vitest calls process.exit() after onFinished with its own
    // exit code, which doesn't account for nested test failures. Override
    // process.exit so our exit code takes precedence on failure.
    if (exitCode !== 0) {
      const originalExit = process.exit;
      process.exit = ((_code?: number) => {
        originalExit.call(process, exitCode);
      }) as never;
    }
  }
}
