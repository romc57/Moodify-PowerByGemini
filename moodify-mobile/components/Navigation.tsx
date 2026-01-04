import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DashboardScreen from './dashboard/DashboardScreen';
import SettingsScreen from './SettingsScreen';

export default function Navigation() {
    const [tab, setTab] = useState<'home' | 'settings'>('home');

    return (
        <SafeAreaView style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
                {tab === 'home' ? <DashboardScreen /> : <SettingsScreen />}
            </View>

            <View style={styles.tabBar}>
                <TouchableOpacity onPress={() => setTab('home')} style={styles.tab}>
                    <Text style={[styles.tabText, tab === 'home' && styles.active]}>Home</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setTab('settings')} style={styles.tab}>
                    <Text style={[styles.tabText, tab === 'settings' && styles.active]}>Settings</Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#ddd', padding: 15, backgroundColor: 'white' },
    tab: { flex: 1, alignItems: 'center' },
    tabText: { fontSize: 16, color: '#888' },
    active: { color: '#007AFF', fontWeight: 'bold' }
});
