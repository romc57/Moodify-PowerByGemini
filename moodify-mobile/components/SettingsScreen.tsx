import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function SettingsScreen() {
    const [apiKey, setApiKey] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    useEffect(() => {
        loadKey();
    }, []);

    const loadKey = async () => {
        const key = await SecureStore.getItemAsync('gemini_api_key');
        if (key) {
            setApiKey(key);
            setIsSaved(true);
        }
    };

    const saveKey = async () => {
        if (!apiKey.trim()) {
            Alert.alert('Error', 'Please enter a valid key');
            return;
        }
        await SecureStore.setItemAsync('gemini_api_key', apiKey.trim());
        setIsSaved(true);
        Alert.alert('Success', 'API Key saved securely!');
    };

    const clearKey = async () => {
        await SecureStore.deleteItemAsync('gemini_api_key');
        setApiKey('');
        setIsSaved(false);
    };

    const openGeminiConsole = () => {
        WebBrowser.openBrowserAsync('https://aistudio.google.com/app/apikey');
    };

    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Settings</Text>

            <View style={styles.section}>
                <Text style={styles.label}>Gemini API Key</Text>
                <Text style={styles.subtext}>
                    Required for AI recommendations. Stored safely on-device.
                </Text>

                <TextInput
                    style={styles.input}
                    value={apiKey}
                    onChangeText={setApiKey}
                    placeholder="AIzaSy..."
                    secureTextEntry={true}
                />

                <View style={styles.row}>
                    <Button title={isSaved ? "Update Key" : "Save Key"} onPress={saveKey} />
                    {isSaved && <View style={{ width: 10 }}><Button title="Clear" color="red" onPress={clearKey} /></View>}
                </View>
            </View>

            <TouchableOpacity onPress={() => setShowHelp(!showHelp)} style={styles.helpToggle}>
                <Text style={styles.helpLink}>{showHelp ? "Hide Help" : "Where do I get this key?"}</Text>
            </TouchableOpacity>

            {showHelp && (
                <View style={styles.helpBox}>
                    <Text style={styles.helpText}>1. Go to Google AI Studio.</Text>
                    <Button title="Open Google AI Studio" onPress={openGeminiConsole} />
                    <Text style={styles.helpText}>2. Log in with your Google Account.</Text>
                    <Text style={styles.helpText}>3. Click "Get API key" (top left).</Text>
                    <Text style={styles.helpText}>4. Click "Create API key in new project".</Text>
                    <Text style={styles.helpText}>5. Copy the string starting with "AIza..." and paste it above.</Text>
                </View>
            )}

            <View style={styles.section}>
                <Text style={styles.label}>App Info</Text>
                <Text>Moodify v1.0.0 (Expo)</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
    header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
    section: { backgroundColor: 'white', padding: 15, borderRadius: 10, marginBottom: 15 },
    label: { fontSize: 18, fontWeight: '600', marginBottom: 5 },
    subtext: { color: '#666', marginBottom: 10 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, marginBottom: 10, fontSize: 16 },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    helpToggle: { marginBottom: 15 },
    helpLink: { color: '#007AFF', textAlign: 'center', fontSize: 16 },
    helpBox: { backgroundColor: '#eef', padding: 15, borderRadius: 8, marginBottom: 20 },
    helpText: { marginBottom: 8, fontSize: 14, lineHeight: 20 }
});
