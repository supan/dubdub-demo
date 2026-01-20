import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PlayableCard from '../components/PlayableCard';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80;
const SWIPE_VELOCITY = 0.5;

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
  const { user, sessionToken, logout, refreshUser, loading } = useAuth();
  const router = useRouter();
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  // Animated values
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  
  // Refs to track current state for PanResponder (avoids stale closures)
  const gameStateRef = useRef(gameState);
  const currentIndexRef = useRef(currentIndex);
  const playablesRef = useRef(playables);
  
  // Keep refs in sync with state
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { playablesRef.current = playables; }, [playables]);

  useEffect(() => {
    // Don't navigate while auth is still loading
    if (loading) return;
    
    if (!sessionToken) {
      router.replace('/');
      return;
    }
    
    if (!initialLoadDone) {
      setInitialLoadDone(true);
      setTotalPlayed(user?.total_played || 0);
      fetchPlayables();
    }
  }, [sessionToken, loading]);

  const fetchPlayables = async () => {
    try {
      setGameState('LOADING');
      const response = await axios.get(`${BACKEND_URL}/api/playables/feed`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
        params: { skip: 0, limit: 20 },
      });
      setPlayables(response.data);
      setCurrentIndex(0);
      translateY.setValue(0);
      opacity.setValue(1);
      setGameState('PLAYING');
    } catch (error) {
      console.error('Error fetching playables:', error);
      setGameState('PLAYING');
    }
  };

  // Check if dev user (for special testing features)
  const isDevUser = user?.email?.includes('supanshah51191');

  // Reset progress and reload (for dev testing)
  const handleResetAndReload = async () => {
    try {
      setGameState('LOADING');
      // Reset progress via API
      await axios.post(
        `${BACKEND_URL}/api/dev/reset-progress?email=${user?.email}`,
        {},
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      // Refresh user data
      await refreshUser();
      // Fetch fresh playables
      setInitialLoadDone(false);
      await fetchPlayables();
    } catch (error) {
      console.error('Error resetting progress:', error);
      setGameState('PLAYING');
    }
  };

  const animateToNext = useCallback((onComplete: () => void) => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -SCREEN_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      translateY.setValue(0);
      opacity.setValue(1);
      onComplete();
    });
  }, []);

  const handleTransitionToNext = useCallback(() => {
    const idx = currentIndexRef.current;
    const items = playablesRef.current;
    
    if (idx < items.length - 1) {
      setCurrentIndex(idx + 1);
      setFeedbackData(null);
      setGameState('PLAYING');
    } else {
      setPlayables([]);
      setFeedbackData(null);
      setGameState('PLAYING');
    }
  }, []);

  const handleSkip = useCallback(async () => {
    const state = gameStateRef.current;
    const idx = currentIndexRef.current;
    const items = playablesRef.current;
    
    if (state !== 'PLAYING' || !items[idx]) return;

    try {
      const playable = items[idx];
      await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/skip`,
        {},
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error skipping:', error);
    }
  }, [sessionToken, refreshUser]);

  const doSwipeTransition = useCallback(() => {
    const state = gameStateRef.current;
    
    // Only skip if in PLAYING state (not in feedback)
    if (state === 'PLAYING') {
      handleSkip();
    }
    
    // Animate and transition to next
    animateToNext(handleTransitionToNext);
  }, [handleSkip, animateToNext, handleTransitionToNext]);

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

  // Ref for the transition function so PanResponder can access it
  const doSwipeRef = useRef(doSwipeTransition);
  useEffect(() => { doSwipeRef.current = doSwipeTransition; }, [doSwipeTransition]);

  // PanResponder for swipe gestures - uses refs to avoid stale closures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture vertical swipes upward
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && gestureState.dy < -10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy < 0) {
          translateY.setValue(gestureState.dy);
          const newOpacity = 1 - Math.min(Math.abs(gestureState.dy) / (SCREEN_HEIGHT * 0.3), 0.7);
          opacity.setValue(newOpacity);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldSwipe = 
          gestureState.dy < -SWIPE_THRESHOLD || 
          gestureState.vy < -SWIPE_VELOCITY;

        const currentState = gameStateRef.current;
        
        if (shouldSwipe && (currentState === 'PLAYING' || currentState === 'SHOWING_FEEDBACK')) {
          // Call the latest version of doSwipeTransition via ref
          doSwipeRef.current();
        } else {
          // Spring back to original position
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
          Animated.spring(opacity, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  const isLoading = gameState === 'LOADING';
  const isSubmitting = gameState === 'SUBMITTING';
  const showFeedback = gameState === 'SHOWING_FEEDBACK';

  // Loading state - beautiful branded loading screen
  if (isLoading) {
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <View style={styles.loadingContainer}>
          {/* Animated Logo */}
          <Animated.View style={[styles.loadingLogo, { 
            transform: [{ scale: 1 }],
          }]}>
            <View style={styles.loadingLogoInner}>
              <Ionicons name="infinite" size={80} color="#00FF87" />
            </View>
          </Animated.View>
          
          {/* App Name */}
          <Text style={styles.loadingTitle}>Invin</Text>
          
          {/* Loading Message */}
          <Text style={styles.loadingSubtitle}>Loading your questions...</Text>
          
          {/* Custom Loading Dots */}
          <View style={styles.loadingDotsContainer}>
            <View style={[styles.loadingDot, styles.loadingDotActive]} />
            <View style={[styles.loadingDot, { opacity: 0.5 }]} />
            <View style={[styles.loadingDot, { opacity: 0.3 }]} />
          </View>
          
          {/* Fun Loading Tips */}
          <View style={styles.loadingTipContainer}>
            <Ionicons name="bulb" size={16} color="#FFB800" />
            <Text style={styles.loadingTip}>
              {[
                "Answer quickly to build your streak!",
                "Swipe up to skip to the next question",
                "Challenge yourself with harder categories",
                "Come back daily for new questions!",
              ][Math.floor(Math.random() * 4)]}
            </Text>
          </View>
        </View>
      </LinearGradient>
    );
  }

  if (playables.length === 0) {
    return (
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
            onPress={isDevUser ? handleResetAndReload : () => {
              setInitialLoadDone(false);
              fetchPlayables();
            }}
          >
            <LinearGradient
              colors={['#00FF87', '#00D9FF']}
              style={styles.refreshGradient}
            >
              <Ionicons name="refresh" size={20} color="#0F0F1E" />
              <Text style={styles.refreshText}>
                {isDevUser ? 'Reset & Reload' : 'Check for New'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const currentPlayable = playables[currentIndex];

  return (
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
      <Animated.View 
        style={[
          styles.cardWrapper, 
          { 
            transform: [{ translateY }],
            opacity 
          }
        ]}
        {...panResponder.panHandlers}
      >
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
              
              {/* Answer Explanation */}
              {feedbackData.answer_explanation && (
                <View style={styles.explanationContainer}>
                  <View style={styles.explanationHeader}>
                    <Ionicons name="bulb" size={16} color="#FFB800" />
                    <Text style={styles.explanationLabel}>Did you know?</Text>
                  </View>
                  <Text style={styles.explanationText}>
                    {feedbackData.answer_explanation}
                  </Text>
                </View>
              )}
              
              <View style={styles.streakBadge}>
                <Ionicons name="flame" size={18} color="#FF6B00" />
                <Text style={styles.streakBadgeText}>
                  {feedbackData.current_streak} streak
                </Text>
              </View>
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
          </>
        )}
      </Animated.View>
      
      {/* Swipe hint */}
      <View style={styles.swipeHintBottom}>
        <Ionicons name="chevron-up" size={24} color="#444" />
        <Text style={styles.swipeHintText}>
          {showFeedback ? "Swipe up for next" : "Swipe up to skip"}
        </Text>
      </View>

      {/* Progress indicator */}
      <View style={styles.progressBar}>
        <Text style={styles.progressText}>
          {currentIndex + 1} / {playables.length}
        </Text>
      </View>
    </LinearGradient>
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
  swipeHintBottom: {
    alignItems: 'center',
    paddingBottom: 8,
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
  explanationContainer: {
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    width: '100%',
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  explanationLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFB800',
  },
  explanationText: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
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
  // Loading screen styles
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingLogo: {
    marginBottom: 24,
  },
  loadingLogoInner: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  loadingTitle: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: '#888',
    marginBottom: 32,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 48,
  },
  loadingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00FF87',
  },
  loadingDotActive: {
    opacity: 1,
  },
  loadingTipContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    maxWidth: 320,
  },
  loadingTip: {
    fontSize: 13,
    color: '#FFB800',
    flex: 1,
    lineHeight: 18,
  },
});
