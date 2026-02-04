// jest-setup.js
import 'react-native-gesture-handler/jestSetup';

// Mock the native animated module
jest.mock('react-native-reanimated', () => {
    const Reanimated = require('react-native-reanimated/mock');
    // The mock for `call` immediately calls the callback which is incorrect
    // So we override it with a no-op
    Reanimated.default.call = () => { };
    return Reanimated;
});

// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
// Silence the warning: Animated: `useNativeDriver` is not supported because the native animated module is missing
// jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Mock Expo modules
jest.mock('expo-font');
jest.mock('expo-asset');

// expo-sqlite is not available in Node; use in-memory adapter (required inside factory for Jest)
jest.mock('expo-sqlite', () => {
    const path = require('path');
    const adapterPath = path.join(__dirname, 'tests', 'utils', 'sqliteNodeAdapter.js');
    const mockAdapter = require(adapterPath);
    return {
        openDatabaseSync: () => {
            throw new Error('openDatabaseSync not supported in Jest; use async');
        },
        openDatabaseAsync: (name) => mockAdapter.openDatabaseAsync(name),
    };
});
