import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PlayableCard from '../components/PlayableCard';
import FeedbackModal from '../components/FeedbackModal';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Playable {
  playable_id: string;
  type: string;
  answer_type: string;
  category: string;
  title: string;
  question: any;
  options?: string[];
  correct_answer: string;
  difficulty: string;
}

export default function FeedScreen() {
  const { user, sessionToken, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!user || !sessionToken) {
      router.replace('/');
      return;
    }
    fetchPlayables();
  }, [user, sessionToken]);

  const fetchPlayables = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/playables/feed`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
        params: {
          skip: 0,
          limit: 20,
        },
      });
      setPlayables(response.data);
    } catch (error) {
      console.error('Error fetching playables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (answer: string) => {
    if (submitting || !playables[currentIndex]) return;

    try {
      setSubmitting(true);
      const playable = playables[currentIndex];

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/answer`,
        { answer },
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );

      setFeedbackData(response.data);
      setShowFeedback(true);
      await refreshUser();
    } catch (error) {
      console.error('Error submitting answer:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    // Prevent double-triggering
    if (isTransitioning) {
      console.log('Already transitioning, ignoring...');
      return;
    }
    
    setIsTransitioning(true);
    setShowFeedback(false);
    
    // Smooth fade out, update content, then fade in
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Update content while invisible
      setFeedbackData(null);
      
      if (currentIndex < playables.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        fetchPlayables();
        setCurrentIndex(0);
      }
      
      // Fade back in
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        // Re-enable transitions after complete
        setIsTransitioning(false);
      });
    });
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <ActivityIndicator size="large" color="#00FF87" />
      </LinearGradient>
    );
  }

  if (playables.length === 0) {
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <View style={styles.emptyContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#00FF87" />
          <Text style={styles.emptyTitle}>All caught up!</Text>
          <Text style={styles.emptyText}>You've answered all available questions.</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchPlayables}>
            <LinearGradient
              colors={['#00FF87', '#00D9FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.refreshGradient}
            >
              <Text style={styles.refreshButtonText}>Refresh</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const currentPlayable = playables[currentIndex];

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1E', '#1A1A2E']}
        style={styles.background}
      >
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.streakContainer}>
              <Ionicons name="flame" size={24} color="#FF6B00" />
              <Text style={styles.streakText}>{user?.current_streak || 0}</Text>
            </View>
            <Text style={styles.headerTitle}>Invin</Text>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={24} color="#B0B0C8" />
            </TouchableOpacity>
          </View>
        </View>

        <Animated.View style={[styles.cardContainer, { opacity: fadeAnim }]}>
          <PlayableCard
            playable={currentPlayable}
            onAnswer={handleAnswer}
            submitting={submitting}
          />
        </Animated.View>

        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {playables.length}
          </Text>
        </View>

        {showFeedback && feedbackData && (
          <FeedbackModal
            visible={showFeedback}
            correct={feedbackData.correct}
            correctAnswer={feedbackData.correct_answer}
            currentStreak={feedbackData.current_streak}
            onSwipeUp={handleNext}
          />
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  background: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  streakText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF6B00',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  logoutButton: {
    padding: 8,
  },
  cardContainer: {
    flex: 1,
    padding: 16,
  },
  progressContainer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 16,
    color: '#B0B0C8',
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#B0B0C8',
    marginTop: 8,
    textAlign: 'center',
  },
  refreshButton: {
    marginTop: 24,
    borderRadius: 24,
    overflow: 'hidden',
  },
  refreshGradient: {
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
});
