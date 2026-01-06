import { RecommendationList } from '@/components/RecommendationList';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FeedbackModal } from '@/components/ui/FeedbackModal';
import { VitalsCard } from '@/components/VitalsCard';
import { backgroundService } from '@/services/core/BackgroundService';
import { notificationService } from '@/services/core/NotificationService';
import { recommendationService } from '@/services/core/RecommendationService';
import { RecommendationResponse } from '@/services/gemini/GeminiService';
import { useVitalsStore } from '@/vitals/VitalsStore';
import * as Notifications from 'expo-notifications';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  const { history } = useVitalsStore();
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [currentTrack, setCurrentTrack] = useState('');
  const [loading, setLoading] = useState(false);

  // Initial Setup
  useEffect(() => {
    backgroundService.init();
    notificationService.registerCategories();

    // Listen for Feedback Notifications
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const actionId = response.actionIdentifier;

      if (data.type === 'backround_feedback' || actionId === 'good' || actionId === 'bad') {
        // Determine feedback from Action Button
        if (actionId === 'good') handleFeedback("Good Vibes");
        if (actionId === 'bad') handleFeedback("Not my vibe");

        // Or if they tapped the body, open the modal
        if (actionId === Notifications.DEFAULT_ACTION_IDENTIFIER) {
          if (data.trackName) {
            setCurrentTrack(data.trackName);
            setModalVisible(true);
          }
        }
      }
    });

    return () => sub.remove();
  }, []);

  // Auto-Trigger Recommendation when history grows (simulation)
  useEffect(() => {
    if (history.length > 0 && history.length % 6 === 0) { // Every 6s in simulation
      fetchRecommendation();
    }
  }, [history.length]);

  const fetchRecommendation = async () => {
    if (loading) return;
    setLoading(true);
    try {
      console.log('[Home] Fetching recommendation...');
      const result = await recommendationService.getRecommendation();
      if (result) {
        setRecommendation(result);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = () => {
    if (recommendation?.suggestedAction.query) {
      setCurrentTrack(recommendation.suggestedAction.query);
      // Show player notification
      notificationService.showPlayerNotification(
        recommendation.suggestedAction.query,
        "Moodify AI",
        true
      );

      // Schedule a prompt for 30s later (Simulated here as 10s for demo)
      setTimeout(() => {
        notificationService.showFeedbackNotification(recommendation.suggestedAction.query);
      }, 10000);
    }
  };

  const handleFeedback = async (feedback: string) => {
    await recommendationService.submitFeedback(currentTrack, feedback);
    setModalVisible(false);
    Alert.alert("Thanks", "AI has learned from your feedback.");
    // Should we trigger a new recommendation?
    fetchRecommendation();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText type="title">Moodify</ThemedText>
          <ThemedText style={styles.subtitle}>Powered by Gemini</ThemedText>
        </View>

        <VitalsCard />

        <RecommendationList
          recommendation={recommendation}
          onPlay={handlePlay}
        />

      </ScrollView>

      <FeedbackModal
        visible={modalVisible}
        trackName={currentTrack}
        onFeedback={handleFeedback}
        onClose={() => setModalVisible(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
  },
  scrollContent: {
    paddingBottom: 50,
  }
});
