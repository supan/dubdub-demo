import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import PlayableCard from '../components/PlayableCard';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 100;

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

type GameState = 'LOADING' | 'PLAYING' | 'SUBMITTING' | 'SHOWING_FEEDBACK' | 'TRANSITIONING';

export default function FeedScreen() {
  const { user, sessionToken, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Animated values for smooth swipe
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (!sessionToken) {
      router.replace('/');
      return;
    }
    
    if (!initialLoadDone) {
      setInitialLoadDone(true);
      setTotalPlayed(user?.total_played || 0);
      fetchPlayables();
    }
  }, [sessionToken]);

  const fetchPlayables = async () => {
    try {
      setGameState('LOADING');
      const response = await axios.get(`${BACKEND_URL}/api/playables/feed`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        params: { skip: 0, limit: 20 },
      });
      setPlayables(response.data);
      setCurrentIndex(0);
      translateY.value = 0;
      opacity.value = 1;
      setGameState('PLAYING');
    } catch (error) {
      console.error('Error fetching playables:', error);
      setGameState('PLAYING');
    }
  };

  const handleTransitionToNext = useCallback(() => {
    if (currentIndex < playables.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setFeedbackData(null);
      translateY.value = 0;
      opacity.value = 1;
      setGameState('PLAYING');
    } else {
      setPlayables([]);
      setFeedbackData(null);
      setGameState('PLAYING');
    }
  }, [currentIndex, playables.length]);

  const handleSkip = useCallback(async () => {
    if (gameState !== 'PLAYING' || !playables[currentIndex]) return;

    try {
      const playable = playables[currentIndex];
      await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/skip`,
        {},
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error skipping:', error);
    }
  }, [gameState, playables, currentIndex, sessionToken]);

  const handleAnswer = useCallback(async (answer: string) => {
    if (gameState !== 'PLAYING' || !playables[currentIndex]) return;

    try {
      setGameState('SUBMITTING');
      const playable = playables[currentIndex];

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/answer`,
        { answer },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );

      setFeedbackData(response.data);
      setTotalPlayed(prev => prev + 1);
      setGameState('SHOWING_FEEDBACK');
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error submitting:', error);
      setGameState('PLAYING');
    }
  }, [gameState, playables, currentIndex, sessionToken]);

  // Smooth pan gesture
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      // Only allow upward swipes
      if (event.translationY < 0) {
        translateY.value = event.translationY;
        // Fade out as user swipes up
        opacity.value = interpolate(
          Math.abs(event.translationY),
          [0, SCREEN_HEIGHT * 0.3],
          [1, 0.3],
          Extrapolation.CLAMP
        );
      }
    })
    .onEnd((event) => {
      const shouldSwipe = 
        event.translationY < -SWIPE_THRESHOLD || 
        event.velocityY < -500;

      if (shouldSwipe) {
        // Animate out
        translateY.value = withTiming(-SCREEN_HEIGHT, { duration: 250 }, () => {
          // Handle skip or continue based on state
          if (gameState === 'PLAYING') {
            runOnJS(handleSkip)();
          }
          runOnJS(handleTransitionToNext)();
        });
        opacity.value = withTiming(0, { duration: 200 });
      } else {
        // Spring back
        translateY.value = withSpring(0, { damping: 20, stiffness: 200 });
        opacity.value = withSpring(1);
      }
    })
    .runOnJS(true);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const isLoading = gameState === 'LOADING';
  const isSubmitting = gameState === 'SUBMITTING';
  const showFeedback = gameState === 'SHOWING_FEEDBACK';

  if (isLoading) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
          <ActivityIndicator size="large" color="#00FF87" />
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  if (playables.length === 0) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
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
          
          <View style={styles.emptyContainer}>
            <Ionicons name="trophy" size={80} color="#FFD700" />
            <Text style={styles.emptyTitle}>All Done!</Text>
            <Text style={styles.emptyText}>
              You've completed all questions.{'\n'}Come back later for more!
            </Text>
            
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{user?.total_played || totalPlayed}</Text>
                <Text style={styles.statLabel}>Played</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{user?.correct_answers || 0}</Text>
                <Text style={styles.statLabel}>Correct</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{user?.best_streak || 0}</Text>
                <Text style={styles.statLabel}>Best</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={styles.refreshBtn}
              onPress={() => {
                setInitialLoadDone(false);
                fetchPlayables();
              }}
            >
              <LinearGradient
                colors={['#00FF87', '#00D9FF']}
                style={styles.refreshGradient}
              >
                <Ionicons name="refresh" size={20} color="#0F0F1E" />
                <Text style={styles.refreshText}>Check for New</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </GestureHandlerRootView>
    );
  }

  const currentPlayable = playables[currentIndex];

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        {/* Header */}
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

        {/* Main Content - Swipeable */}
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.cardWrapper, animatedCardStyle]}>
            {showFeedback && feedbackData ? (
              // Feedback View
              <View style={styles.feedbackContainer}>
                <View style={[
                  styles.feedbackCard,
                  feedbackData.correct ? styles.feedbackCorrect : styles.feedbackIncorrect
                ]}>
                  <Ionicons 
                    name={feedbackData.correct ? "checkmark-circle" : "close-circle"} 
                    size={72} 
                    color={feedbackData.correct ? "#00FF87" : "#FF6B6B"} 
                  />
                  
                  <Text style={styles.feedbackTitle}>
                    {feedbackData.correct ? "Correct!" : "Wrong"}
                  </Text>
                  
                  {!feedbackData.correct && (
                    <Text style={styles.correctAnswerText}>
                      Answer: {feedbackData.correct_answer}
                    </Text>
                  )}
                  
                  <View style={styles.streakBadge}>
                    <Ionicons name="flame" size={18} color="#FF6B00" />
                    <Text style={styles.streakBadgeText}>
                      {feedbackData.current_streak} streak
                    </Text>
                  </View>
                </View>
                
                {/* Swipe hint */}
                <View style={styles.swipeHint}>
                  <Ionicons name="chevron-up" size={28} color="#555" />
                  <Text style={styles.swipeHintText}>Swipe up for next</Text>
                </View>
              </View>
            ) : (
              // Question View
              <>
                {currentPlayable && (
                  <PlayableCard
                    playable={currentPlayable}
                    onAnswer={handleAnswer}
                    submitting={isSubmitting}
                  />
                )}
                
                {/* Swipe hint */}
                <View style={styles.swipeHint}>
                  <Ionicons name="chevron-up" size={28} color="#555" />
                  <Text style={styles.swipeHintText}>Swipe up to skip</Text>
                </View>
              </>
            )}
          </Animated.View>
        </GestureDetector>

        {/* Progress indicator */}
        <View style={styles.progressBar}>
          <Text style={styles.progressText}>
            {currentIndex + 1} / {playables.length}
          </Text>
        </View>
      </LinearGradient>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 12,
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
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  streakText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FF6B00',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoutButton: {
    padding: 8,
  },
  cardWrapper: {
    flex: 1,
  },
  progressBar: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  swipeHint: {
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  swipeHintText: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
  },
  // Feedback styles
  feedbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  feedbackCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 24,
    padding: 40,
    alignItems: 'center',
    width: '100%',
    borderWidth: 3,
  },
  feedbackCorrect: {
    borderColor: '#00FF87',
  },
  feedbackIncorrect: {
    borderColor: '#FF6B6B',
  },
  feedbackTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  correctAnswerText: {
    fontSize: 16,
    color: '#888',
    marginBottom: 16,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
    marginTop: 12,
  },
  streakBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B00',
  },
  // Empty state
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 32,
    gap: 16,
  },
  statBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    minWidth: 80,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#00FF87',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  refreshBtn: {
    marginTop: 32,
    borderRadius: 24,
    overflow: 'hidden',
  },
  refreshGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  refreshText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
});
