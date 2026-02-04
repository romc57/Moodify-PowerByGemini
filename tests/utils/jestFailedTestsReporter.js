/**
 * Jest custom reporter: prints a clear FAILED TESTS summary at the end
 * so details are not buried in console output.
 */

class FailedTestsReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options;
    }

    onRunComplete(contexts, aggregatedResult) {
        const { numFailedTestSuites, numFailedTests, testResults } = aggregatedResult;
        if (numFailedTests === 0) return;

        const lines = [
            '',
            '========== FAILED TESTS SUMMARY ==========',
            `Total: ${numFailedTests} failed test(s) in ${numFailedTestSuites} suite(s). Full error and stack below.`,
            ''
        ];

        testResults.forEach((suiteResult) => {
            const failed = suiteResult.testResults.filter(t => t.status === 'failed');
            if (failed.length === 0) return;

            const file = suiteResult.testFilePath.replace(process.cwd(), '').replace(/^\//, '') || suiteResult.testFilePath;
            lines.push(`Suite: ${file}`);
            failed.forEach((test) => {
                lines.push(`  ✗ ${test.fullName}`);
                if (test.failureMessages && test.failureMessages.length) {
                    test.failureMessages.forEach((msg) => {
                        msg.split('\n').forEach((line) => lines.push(`    ${line}`));
                    });
                }
                lines.push('');
            });
        });

        lines.push('======================================');
        lines.push('');
        // eslint-disable-next-line no-console
        console.log(lines.join('\n'));
    }
}

module.exports = FailedTestsReporter;
