import Slider from '@react-native-community/slider';
import React from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useVitalsStore } from '../../vitals/VitalsStore';

export default function VitalsSimulationCard() {
    const { isMonitoring, start, stop, current, setSimulatedHR, setSimulatedStress } = useVitalsStore();

    return (
        <View style={styles.card}>
            <Text style={styles.title}>Vitals Simulator (Dev)</Text>

            <View style={styles.row}>
                <Text>Monitoring Active</Text>
                <Switch value={isMonitoring} onValueChange={(val) => val ? start() : stop()} />
            </View>

            <View style={styles.control}>
                <Text>Heart Rate: {current.heartRate} bpm</Text>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={40}
                    maximumValue={180}
                    step={1}
                    value={current.heartRate || 75}
                    onValueChange={setSimulatedHR}
                />
            </View>

            <View style={styles.control}>
                <Text>Stress Level: {current.stressLevel}/100</Text>
                <Slider
                    style={{ width: '100%', height: 40 }}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={current.stressLevel || 20}
                    onValueChange={setSimulatedStress}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#fff',
        padding: 15,
        borderRadius: 12,
        marginVertical: 10,
        elevation: 3,
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    title: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#444' },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
    control: { marginBottom: 10 }
});
