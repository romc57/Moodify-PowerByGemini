import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
    visible: boolean;
    trackName: string;
    onFeedback: (feedback: string) => void;
    onClose: () => void;
}

export const FeedbackModal = ({ visible, trackName, onFeedback, onClose }: Props) => {
    return (
        <Modal
            animationType="fade"
            transparent={true}
            visible={visible}
            onRequestClose={onClose}
        >
            <View style={styles.centeredView}>
                <View style={styles.modalView}>
                    <Text style={styles.title}>How is the vibe?</Text>
                    <Text style={styles.subtitle}>"{trackName}"</Text>

                    <View style={styles.options}>
                        <Pressable
                            style={[styles.button, styles.goodBtn]}
                            onPress={() => onFeedback("Perfect match, keeps focus")}
                        >
                            <Text style={styles.btnText}>🎯 Perfect</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.button, styles.relaxBtn]}
                            onPress={() => onFeedback("Relaxing / Calming")}
                        >
                            <Text style={styles.btnText}>😌 Relaxing</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.button, styles.energyBtn]}
                            onPress={() => onFeedback("Too Energetic")}
                        >
                            <Text style={styles.btnText}>⚡ Too fast</Text>
                        </Pressable>

                        <Pressable
                            style={[styles.button, styles.badBtn]}
                            onPress={() => onFeedback("Not my vibe")}
                        >
                            <Text style={styles.btnText}>👎 Bad Match</Text>
                        </Pressable>
                    </View>

                    <Pressable onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeText}>Close</Text>
                    </Pressable>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    centeredView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
    },
    modalView: {
        width: '85%',
        backgroundColor: '#1E293B',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        shadowColor: '#000',
        elevation: 5,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#94A3B8',
        marginBottom: 24,
        textAlign: 'center',
    },
    options: {
        width: '100%',
        gap: 12,
    },
    button: {
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
    },
    goodBtn: { backgroundColor: '#4ADE80' },
    relaxBtn: { backgroundColor: '#60A5FA' },
    energyBtn: { backgroundColor: '#FBBF24' },
    badBtn: { backgroundColor: '#EF4444' },
    btnText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1E293B',
    },
    closeBtn: {
        marginTop: 20,
        padding: 10,
    },
    closeText: {
        color: '#94A3B8',
    }
});
