import React, { useEffect, useState, useRef, useCallback } from 'react';
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

  // Only allow continue when showing feedback - user must click Continue button
  const handleNext = useCallback(() => {
    console.log('handleNext called, current state:', gameState);
    
    // STRICT state check - only process if showing feedback
    if (gameState !== 'SHOWING_FEEDBACK') {
      console.log('Ignoring next - not in SHOWING_FEEDBACK state:', gameState);
      return;
    }
    
    // Transition to TRANSITIONING state - prevents any other actions
    setGameState('TRANSITIONING');
    
    // Clear feedback data
    setFeedbackData(null);
    
    // Smooth fade out, update content, then fade in
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Update playable index while invisible
      if (currentIndex < playables.length - 1) {
        setCurrentIndex(prev => prev + 1);
        
        // Fade back in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start(() => {
          // ONLY NOW return to playing state
          setGameState('PLAYING');
        });
      } else {
        // Need more playables - fetch and reset
        fetchPlayables();
      }
    });
  }, [gameState, currentIndex, playables.length, fadeAnim]);

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
          {currentPlayable && (
            <PlayableCard
              playable={currentPlayable}
              onAnswer={handleAnswer}
              submitting={isSubmitting}
            />
          )}
        </Animated.View>

        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {totalPlayed + 1} / 8
          </Text>
        </View>

        {/* Feedback Modal - only shown when in SHOWING_FEEDBACK state */}
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
