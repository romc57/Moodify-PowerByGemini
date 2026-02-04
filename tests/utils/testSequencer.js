/**
 * Custom Jest Test Sequencer
 *
 * Ensures tests run in the correct order:
 * 1. Auth tests (00-auth/) - Must pass first
 * 2. Integration tests - Real API calls
 * 3. Unit tests - Can use mocks if needed
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomSequencer extends Sequencer {
    sort(tests) {
        const copyTests = [...tests];

        return copyTests.sort((testA, testB) => {
            const pathA = testA.path;
            const pathB = testB.path;

            // Auth tests run first (00-auth directory)
            const isAuthA = pathA.includes('00-auth');
            const isAuthB = pathB.includes('00-auth');

            if (isAuthA && !isAuthB) return -1;
            if (!isAuthA && isAuthB) return 1;

            // Integration tests run second
            const isIntegrationA = pathA.includes('integration');
            const isIntegrationB = pathB.includes('integration');

            if (isIntegrationA && !isIntegrationB) return -1;
            if (!isIntegrationA && isIntegrationB) return 1;

            // Unit tests run last
            // Default: alphabetical order
            return pathA.localeCompare(pathB);
        });
    }
}

module.exports = CustomSequencer;
