import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import VitalsSimulationCard from './VitalsSimulationCard';

export default function DashboardScreen() {
    return (
        <ScrollView style={styles.container}>
            <Text style={styles.header}>Moodify</Text>

            <VitalsSimulationCard />

            <View style={styles.section}>
                <Text style={styles.label}>Recommended</Text>
                <Text style={{ color: '#888', fontStyle: 'italic' }}>Connect a service to see recommendations.</Text>
            </View>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 15, backgroundColor: '#f5f5f5' },
    header: { fontSize: 32, fontWeight: 'bold', marginBottom: 20 },
    section: { marginTop: 20 },
    label: { fontSize: 20, fontWeight: '600', marginBottom: 10 }
});
