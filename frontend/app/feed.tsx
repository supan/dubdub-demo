import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
  Platform,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import PlayableCard from '../components/PlayableCard';
import FeedbackModal from '../components/FeedbackModal';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SWIPE_THRESHOLD = 80; // Minimum swipe distance to trigger action
const SWIPE_VELOCITY_THRESHOLD = 500; // Minimum velocity to trigger swipe

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

// State machine states for proper flow control
type GameState = 'LOADING' | 'PLAYING' | 'SUBMITTING' | 'SHOWING_FEEDBACK' | 'TRANSITIONING';

export default function FeedScreen() {
  const { user, sessionToken, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [feedbackData, setFeedbackData] = useState<any>(null);
  const [totalPlayed, setTotalPlayed] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  
  // State machine - single source of truth for game state
  const [gameState, setGameState] = useState<GameState>('LOADING');
  
  // Track if initial load is done to prevent re-fetching
  const initialLoadDone = useRef(false);

  // Initial authentication check - only run once
  useEffect(() => {
    if (!sessionToken) {
      router.replace('/');
      return;
    }
    
    // Only fetch playables once on initial mount
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      setTotalPlayed(user?.total_played || 0);
      fetchPlayables();
    }
  }, [sessionToken]);

  const fetchPlayables = async () => {
    try {
      setGameState('LOADING');
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
      setCurrentIndex(0);
      setGameState('PLAYING');
    } catch (error) {
      console.error('Error fetching playables:', error);
      setGameState('PLAYING'); // Allow retry
    }
  };

  // Handle skip - swipe up without answering
  const handleSkip = useCallback(async () => {
    if (gameState !== 'PLAYING' || !playables[currentIndex]) {
      return;
    }

    try {
      const playable = playables[currentIndex];
      
      // Call skip API
      await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/skip`,
        {},
        {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        }
      );
      
      // Move to next question
      moveToNext();
      
      // Refresh user stats in background
      refreshUser().catch(console.error);
      
    } catch (error) {
      console.error('Error skipping playable:', error);
    }
  }, [gameState, playables, currentIndex, sessionToken, refreshUser]);

  // Only allow answer submission when in PLAYING state
  const handleAnswer = useCallback(async (answer: string) => {
    // STRICT state check - only process if in PLAYING state
    if (gameState !== 'PLAYING' || !playables[currentIndex]) {
      console.log('Ignoring answer - not in PLAYING state:', gameState);
      return;
    }

    try {
      setGameState('SUBMITTING');
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

      // Store feedback data
      setFeedbackData(response.data);
      setTotalPlayed(prev => prev + 1);
      
      // NOW show feedback modal - this is the ONLY place we transition to SHOWING_FEEDBACK
      setGameState('SHOWING_FEEDBACK');
      
      // Refresh user stats in background (don't await - fire and forget)
      refreshUser().catch(console.error);
      
    } catch (error) {
      console.error('Error submitting answer:', error);
      // On error, return to playing state so user can retry
      setGameState('PLAYING');
    }
  }, [gameState, playables, currentIndex, sessionToken, refreshUser]);

  // Move to next question with animation
  const moveToNext = useCallback(() => {
    setGameState('TRANSITIONING');
    setFeedbackData(null);
    
    // Animate slide up and fade out
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -SCREEN_HEIGHT,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Reset position instantly
      translateY.setValue(0);
      
      // Check if there are more playables
      if (currentIndex < playables.length - 1) {
        setCurrentIndex(prev => prev + 1);
        
        // Fade back in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          setGameState('PLAYING');
        });
      } else {
        // No more playables - show completion screen
        setPlayables([]);
        fadeAnim.setValue(1);
        setGameState('PLAYING');
      }
    });
  }, [currentIndex, playables.length, fadeAnim, translateY]);

  // Handle swipe on feedback modal - dismiss and move to next
  const handleFeedbackSwipe = useCallback(() => {
    if (gameState !== 'SHOWING_FEEDBACK') {
      return;
    }
    moveToNext();
  }, [gameState, moveToNext]);

  // Swipe gesture for skipping (when playing) or continuing (when showing feedback)
  const swipeGesture = Gesture.Pan()
    .onEnd((event) => {
      const { translationY, velocityY } = event;
      
      // Check if swipe is significant enough (distance or velocity)
      const isSwipeUp = translationY < -SWIPE_THRESHOLD || velocityY < -SWIPE_VELOCITY_THRESHOLD;
      
      if (isSwipeUp) {
        if (gameState === 'PLAYING') {
          // Skip the current question
          handleSkip();
        } else if (gameState === 'SHOWING_FEEDBACK') {
          // Dismiss feedback and go to next
          handleFeedbackSwipe();
        }
      }
    })
    .runOnJS(true);

  const handleLogout = async () => {
    await logout();
    router.replace('/');
  };

  // Derive UI states from the game state
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
            <View style={styles.completionIcon}>
              <Ionicons name="trophy" size={80} color="#FFD700" />
            </View>
            <Text style={styles.emptyTitle}>All Done!</Text>
            <Text style={styles.emptyText}>
              You've completed all available questions.{'\n'}
              Great job! Come back later for more.
            </Text>
            
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.total_played || totalPlayed}</Text>
                <Text style={styles.statLabel}>Played</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.correct_answers || 0}</Text>
                <Text style={styles.statLabel}>Correct</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{user?.best_streak || 0}</Text>
                <Text style={styles.statLabel}>Best Streak</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.refreshButton} onPress={() => {
              initialLoadDone.current = false;
              fetchPlayables();
            }}>
              <LinearGradient
                colors={['#00FF87', '#00D9FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.refreshGradient}
              >
                <Ionicons name="refresh" size={20} color="#0F0F1E" />
                <Text style={styles.refreshButtonText}>Check for New Questions</Text>
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

          <GestureDetector gesture={swipeGesture}>
            <Animated.View 
              style={[
                styles.cardContainer, 
                { 
                  opacity: fadeAnim,
                  transform: [{ translateY: translateY }]
                }
              ]}
            >
              {currentPlayable && (
                <PlayableCard
                  playable={currentPlayable}
                  onAnswer={handleAnswer}
                  submitting={isSubmitting}
                />
              )}
              
              {/* Swipe hint at bottom */}
              {gameState === 'PLAYING' && (
                <View style={styles.swipeHintContainer}>
                  <Animated.View style={styles.swipeHint}>
                    <Ionicons name="chevron-up" size={24} color="#666" />
                    <Text style={styles.swipeHintText}>Swipe up to skip</Text>
                  </Animated.View>
                </View>
              )}
            </Animated.View>
          </GestureDetector>

          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {currentIndex + 1} / {playables.length}
            </Text>
          </View>

          {/* Feedback Modal - swipeable */}
          {showFeedback && feedbackData && (
            <GestureDetector gesture={swipeGesture}>
              <View style={styles.feedbackOverlay}>
                <Animated.View style={styles.feedbackContainer}>
                  <View style={[
                    styles.feedbackCard,
                    feedbackData.correct ? styles.feedbackCorrect : styles.feedbackIncorrect
                  ]}>
                    <View style={styles.feedbackIconContainer}>
                      <Ionicons 
                        name={feedbackData.correct ? "checkmark-circle" : "close-circle"} 
                        size={80} 
                        color={feedbackData.correct ? "#00FF87" : "#FF6B6B"} 
                      />
                    </View>
                    
                    <Text style={styles.feedbackTitle}>
                      {feedbackData.correct ? "Correct! 🎉" : "Incorrect 😔"}
                    </Text>
                    
                    {!feedbackData.correct && (
                      <Text style={styles.correctAnswerText}>
                        Correct answer: {feedbackData.correct_answer}
                      </Text>
                    )}
                    
                    <View style={styles.streakBadge}>
                      <Ionicons name="flame" size={20} color="#FF6B00" />
                      <Text style={styles.streakBadgeText}>
                        Streak: {feedbackData.current_streak}
                      </Text>
                    </View>
                    
                    {/* Swipe hint */}
                    <View style={styles.feedbackSwipeHint}>
                      <Ionicons name="chevron-up" size={28} color="#888" />
                      <Text style={styles.feedbackSwipeText}>Swipe up for next</Text>
                    </View>
                  </View>
                </Animated.View>
              </View>
            </GestureDetector>
          )}
        </LinearGradient>
      </View>
    </GestureHandlerRootView>
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
  completionIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 8,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#B0B0C8',
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginTop: 32,
    gap: 20,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#00FF87',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshButton: {
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
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  // Swipe hint styles
  swipeHintContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  swipeHint: {
    alignItems: 'center',
    opacity: 0.6,
  },
  swipeHintText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  // Feedback overlay styles
  feedbackOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  feedbackContainer: {
    width: '85%',
    maxWidth: 340,
  },
  feedbackCard: {
    backgroundColor: '#1E1E2E',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
  },
  feedbackCorrect: {
    borderColor: '#00FF87',
  },
  feedbackIncorrect: {
    borderColor: '#FF6B6B',
  },
  feedbackIconContainer: {
    marginBottom: 16,
  },
  feedbackTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  correctAnswerText: {
    fontSize: 16,
    color: '#B0B0C8',
    marginBottom: 16,
    textAlign: 'center',
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
    marginTop: 8,
  },
  streakBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FF6B00',
  },
  feedbackSwipeHint: {
    marginTop: 32,
    alignItems: 'center',
  },
  feedbackSwipeText: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
});
