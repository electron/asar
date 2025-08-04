import { RunnerTestFile } from "vitest"
import { Reporter } from "vitest/reporters"

export default class ElectronExitReporter implements Reporter {
  onFinished(files: RunnerTestFile[], errors: unknown[]) {
    if (!process.versions.electron) {
      return;
    }

    let failureCount = 0

    files.forEach(file => {
      if (file.result) {
        // Count individual test results
        if (file.result.state === 'fail') {
          failureCount++
        }
        
        // Also check for failed tasks within the file
        if (file.tasks) {
          file.tasks.forEach(task => {
            if (task.result?.state === 'fail') {
              failureCount++
            }
          })
        }
      }
    })
    
    // Check for execution errors
    const hasExecutionErrors = errors && errors.length > 0
    
    if (failureCount > 0 || hasExecutionErrors) {
      process.exit(1)
    } else {
      process.exit(0)
    }
  }
}