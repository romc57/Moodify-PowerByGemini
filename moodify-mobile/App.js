import { registerRootComponent } from 'expo';
import { StatusBar } from 'react-native';
import Navigation from './components/Navigation';

export default function App() {
    return (
        <>
            <StatusBar barStyle="dark-content" />
            <Navigation />
        </>
    );
}

registerRootComponent(App);
