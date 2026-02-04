const baseConfig = {
    preset: 'jest-expo',
    setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
    setupFiles: ['<rootDir>/jest-env-setup.js'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1'
    },
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)'
    ],
};

module.exports = {
    verbose: true,
    reporters: [
        'default',
        ['<rootDir>/tests/utils/jestFailedTestsReporter.js', {}]
    ],
    testSequencer: '<rootDir>/tests/utils/testSequencer.js',
    testTimeout: 60000,
    projects: [
        {
            ...baseConfig,
            displayName: 'auth',
            testMatch: ['<rootDir>/tests/00-auth/**/*.test.ts'],
        },
        {
            ...baseConfig,
            displayName: 'integration',
            testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
        },
        {
            ...baseConfig,
            displayName: 'unit',
            testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],
        }
    ]
};
