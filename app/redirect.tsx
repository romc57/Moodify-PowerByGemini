import { Redirect } from 'expo-router';

export default function RedirectScreen() {
    // This screen handles the auth redirect deep link.
    // We redirect back to root, while the useSpotifyAuth hook handles the token exchange.
    return <Redirect href="/" />;
}
