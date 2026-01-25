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
  Share,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import PlayableCard from '../components/PlayableCard';
import FeedbackOverlay from '../components/FeedbackOverlay';
import ChessPuzzleCard from '../components/ChessPuzzleCard';

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
  
  // Session stats for end screen
  const [sessionStats, setSessionStats] = useState({
    played: 0,
    correct: 0,
    bestStreak: 0,
    categoryStats: {} as Record<string, number>,
  });
  const [previousStreak, setPreviousStreak] = useState(0);

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
    
    // Give a small buffer to ensure session is restored from storage
    if (!sessionToken) {
      // Only redirect if we've given time for the session to be restored
      const timer = setTimeout(() => {
        if (!sessionToken) {
          router.replace('/');
        }
      }, 100);
      return () => clearTimeout(timer);
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
      // First update state (while content is still hidden)
      onComplete();
      // Then reset animation values to bring new content into view
      // Use a small delay to ensure state update completes
      setTimeout(() => {
        translateY.setValue(0);
        opacity.setValue(1);
      }, 50);
    });
  }, []);

  const handleTransitionToNext = useCallback(() => {
    const idx = currentIndexRef.current;
    const items = playablesRef.current;
    
    if (idx < items.length - 1) {
      // Move to next question
      setCurrentIndex(idx + 1);
      setFeedbackData(null);
      setGameState('PLAYING');
    } else {
      // No more questions - show empty state
      // Set gameState first to trigger the empty state render
      setGameState('PLAYING');
      setPlayables([]);
      setFeedbackData(null);
      setCurrentIndex(0);
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
    const idx = currentIndexRef.current;
    const items = playablesRef.current;
    
    // Only skip if in PLAYING state (not in feedback)
    if (state === 'PLAYING') {
      handleSkip();
    }
    
    // Animate and transition to next
    animateToNext(() => {
      // Use captured values from refs
      if (idx < items.length - 1) {
        setCurrentIndex(idx + 1);
        setFeedbackData(null);
        setGameState('PLAYING');
      } else {
        // No more questions - show empty state
        setGameState('PLAYING');
        setPlayables([]);
        setFeedbackData(null);
        setCurrentIndex(0);
      }
    });
  }, [handleSkip, animateToNext]);

  const handleAnswer = useCallback(async (answer: string) => {
    if (gameState !== 'PLAYING' || !playables[currentIndex]) return;

    try {
      setGameState('SUBMITTING');
      const playable = playables[currentIndex];
      
      // Store previous streak before answer
      const prevStreak = user?.current_streak || 0;
      setPreviousStreak(prevStreak);

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/answer`,
        { answer },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );

      const result = response.data;
      
      // Update session stats
      setSessionStats(prev => {
        const newStats = {
          played: prev.played + 1,
          correct: result.correct ? prev.correct + 1 : prev.correct,
          bestStreak: Math.max(prev.bestStreak, result.current_streak || 0),
          categoryStats: { ...prev.categoryStats },
        };
        if (result.correct) {
          newStats.categoryStats[playable.category] = (prev.categoryStats[playable.category] || 0) + 1;
        }
        return newStats;
      });
      
      // Add extra feedback data
      setFeedbackData({
        ...result,
        category: playable.category,
        categoryCorrectCount: (sessionStats.categoryStats[playable.category] || 0) + (result.correct ? 1 : 0),
        previousStreak: prevStreak,
      });
      setTotalPlayed(prev => prev + 1);
      setGameState('SHOWING_FEEDBACK');
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error submitting:', error);
      setGameState('PLAYING');
    }
  }, [gameState, playables, currentIndex, sessionToken, user, sessionStats]);

  // Handle "Guess the X" answer submission
  const handleGuessAnswer = useCallback(async (answer: string, hintNumber: number) => {
    if (!playables[currentIndex]) return null;

    try {
      const playable = playables[currentIndex];

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/guess-answer`,
        { answer, hint_number: hintNumber },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );

      const result = response.data;
      
      // If correct, show feedback then transition
      if (result.correct) {
        // Update session stats for Guess the X
        setSessionStats(prev => {
          const playable = playables[currentIndex];
          const newStats = {
            played: prev.played + 1,
            correct: prev.correct + 1,
            bestStreak: Math.max(prev.bestStreak, result.current_streak || 0),
            categoryStats: { ...prev.categoryStats },
          };
          newStats.categoryStats[playable.category] = (prev.categoryStats[playable.category] || 0) + 1;
          return newStats;
        });
        
        setFeedbackData({
          correct: true,
          correct_answer: result.correct_answer,
          feedback_message: result.feedback_message,
          hints_used: result.hints_used,
          current_streak: result.current_streak,
          category: playables[currentIndex]?.category,
        });
        setTotalPlayed(prev => prev + 1);
        setGameState('SHOWING_FEEDBACK');
        refreshUser().catch(console.error);
      } else if (result.all_hints_exhausted) {
        // All hints used - count as played but not correct
        setSessionStats(prev => ({
          ...prev,
          played: prev.played + 1,
        }));
        setTotalPlayed(prev => prev + 1);
        refreshUser().catch(console.error);
      }
      
      return result;
    } catch (error) {
      console.error('Error submitting guess:', error);
      return null;
    }
  }, [playables, currentIndex, sessionToken, refreshUser]);

  // Handle chess puzzle completion
  const handleChessPuzzleSolved = useCallback(async (movesUsed: number) => {
    if (!playables[currentIndex]) return;

    try {
      const playable = playables[currentIndex];

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/chess-solved`,
        { solved: true, moves_used: movesUsed },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );

      const result = response.data;
      
      // Update session stats for Chess puzzle
      setSessionStats(prev => {
        const newStats = {
          played: prev.played + 1,
          correct: prev.correct + 1,
          bestStreak: Math.max(prev.bestStreak, result.current_streak || 0),
          categoryStats: { ...prev.categoryStats },
        };
        newStats.categoryStats[playable.category] = (prev.categoryStats[playable.category] || 0) + 1;
        return newStats;
      });
      
      setFeedbackData({
        correct: true,
        current_streak: result.current_streak,
        moves_used: movesUsed,
        category: playable.category,
      });
      setTotalPlayed(prev => prev + 1);
      setGameState('SHOWING_FEEDBACK');
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error submitting chess puzzle result:', error);
    }
  }, [playables, currentIndex, sessionToken, refreshUser]);

  const handleChessPuzzleFailed = useCallback(async () => {
    if (!playables[currentIndex]) return;

    try {
      const playable = playables[currentIndex];

      const response = await axios.post(
        `${BACKEND_URL}/api/playables/${playable.playable_id}/chess-solved`,
        { solved: false, moves_used: 0 },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );

      const result = response.data;
      
      // Update session stats for failed Chess puzzle
      setSessionStats(prev => ({
        ...prev,
        played: prev.played + 1,
        // correct stays same, bestStreak stays same
      }));
      
      setFeedbackData({
        correct: false,
        current_streak: result.current_streak,
        category: playable.category,
      });
      setTotalPlayed(prev => prev + 1);
      setGameState('SHOWING_FEEDBACK');
      refreshUser().catch(console.error);
    } catch (error) {
      console.error('Error submitting chess puzzle result:', error);
    }
  }, [playables, currentIndex, sessionToken, refreshUser]);

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
          <Text style={styles.loadingTitle}>dubdub</Text>
          
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
    // Calculate session performance
    const accuracy = sessionStats.played > 0 
      ? Math.round((sessionStats.correct / sessionStats.played) * 100) 
      : 0;
    
    // Fake percentile based on performance (psychological boost)
    const getPercentile = () => {
      if (accuracy >= 90) return "Top 5%";
      if (accuracy >= 80) return "Top 10%";
      if (accuracy >= 70) return "Top 20%";
      if (accuracy >= 60) return "Top 30%";
      return "Top 50%";
    };
    
    // Achievement badges
    const achievements: { icon: string; title: string; description: string }[] = [];
    if (sessionStats.played > 0 && sessionStats.correct === sessionStats.played) {
      achievements.push({ icon: "🏆", title: "Perfect Round", description: "100% accuracy!" });
    }
    if (sessionStats.bestStreak >= 5) {
      achievements.push({ icon: "🔥", title: "Streak Master", description: `${sessionStats.bestStreak} in a row!` });
    }
    
    // Return hook messages
    const returnHooks = [
      "Come back tomorrow to keep your momentum!",
      "New questions added daily, don't miss out!",
      "Your streak is waiting for you tomorrow!",
      "Practice makes perfect, see you soon!",
    ];
    
    // Generate competitive share message
    const generateShareMessage = () => {
      const streakEmoji = sessionStats.bestStreak >= 5 ? '🔥🔥🔥' : sessionStats.bestStreak >= 3 ? '🔥🔥' : '🔥';
      const percentile = getPercentile();
      
      // Different messages based on performance
      if (accuracy === 100 && sessionStats.played > 0) {
        return `🏆 PERFECT ROUND on dubdub!\n\n` +
          `📊 ${sessionStats.correct}/${sessionStats.played} correct\n` +
          `${streakEmoji} ${sessionStats.bestStreak} streak\n` +
          `🎯 ${accuracy}% accuracy\n\n` +
          `${percentile} worldwide. Think you can beat that? 💪`;
      } else if (sessionStats.bestStreak >= 5) {
        return `${streakEmoji} ${sessionStats.bestStreak} STREAK on dubdub!\n\n` +
          `📊 Score: ${sessionStats.correct}/${sessionStats.played}\n` +
          `🎯 Accuracy: ${accuracy}%\n\n` +
          `Only ${percentile} get this far. Your move 🎮`;
      } else if (accuracy >= 80) {
        return `🧠 Just dominated on dubdub!\n\n` +
          `📊 ${sessionStats.correct}/${sessionStats.played} correct\n` +
          `${streakEmoji} Best streak: ${sessionStats.bestStreak}\n` +
          `🎯 ${accuracy}% accuracy\n\n` +
          `${percentile} performance. Can you do better? 😏`;
      } else {
        return `⚡ Just finished a dubdub session!\n\n` +
          `📊 Score: ${sessionStats.correct}/${sessionStats.played}\n` +
          `${streakEmoji} Streak: ${sessionStats.bestStreak}\n\n` +
          `Think you're smarter? Prove it 🎯`;
      }
    };
    
    const handleShare = async () => {
      try {
        const message = generateShareMessage();
        await Share.share({
          message: message,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    };
    
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.streakContainer}>
              <Ionicons name="flame" size={24} color="#FF6B00" />
              <Text style={styles.streakText}>{user?.current_streak || sessionStats.bestStreak}</Text>
            </View>
            <Text style={styles.headerTitle}>dubdub</Text>
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={24} color="#B0B0C8" />
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.emptyContainer}>
          {/* Trophy Icon */}
          <View style={styles.trophyContainer}>
            <Ionicons name="trophy" size={64} color="#FFD700" />
          </View>
          
          {/* Main Title */}
          <Text style={styles.emptyTitle}>Set 1 Done! 🎉</Text>
          
          {/* Performance Percentile */}
          {sessionStats.played > 0 && (
            <View style={styles.percentileBadge}>
              <Ionicons name="trending-up" size={16} color="#00FF87" />
              <Text style={styles.percentileText}>{getPercentile()} performance today!</Text>
            </View>
          )}
          
          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{sessionStats.correct}/{sessionStats.played}</Text>
              <Text style={styles.statLabel}>Score</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{accuracy}%</Text>
              <Text style={styles.statLabel}>Accuracy</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{sessionStats.bestStreak}</Text>
              <Text style={styles.statLabel}>Best Streak</Text>
            </View>
          </View>
          
          {/* Achievements */}
          {achievements.length > 0 && (
            <View style={styles.achievementsContainer}>
              <Text style={styles.achievementsTitle}>Achievements Unlocked</Text>
              {achievements.map((achievement, idx) => (
                <View key={idx} style={styles.achievementBadge}>
                  <Text style={styles.achievementIcon}>{achievement.icon}</Text>
                  <View style={styles.achievementTextContainer}>
                    <Text style={styles.achievementTitle}>{achievement.title}</Text>
                    <Text style={styles.achievementDesc}>{achievement.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          
          {/* Your Strength */}
          <View style={styles.bestCategoryBadge}>
            <Text style={styles.bestCategoryLabel}>Your Strength</Text>
            <Text style={styles.bestCategoryValue}>Logical Thinking ⭐</Text>
          </View>
          
          {/* Share Button */}
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <LinearGradient
              colors={['#00FF87', '#00D9FF']}
              style={styles.shareGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="share-social" size={22} color="#0F0F1E" />
              <Text style={styles.shareText}>Challenge Friends</Text>
            </LinearGradient>
          </TouchableOpacity>
          
          {/* Swipe Up for Next Set */}
          <View style={styles.swipeUpHint}>
            <Ionicons name="chevron-up" size={24} color="rgba(255,255,255,0.5)" />
            <Text style={styles.swipeUpText}>Swipe up for next</Text>
          </View>
          
          {/* Refresh Button - Hidden for demo */}
          {/* <TouchableOpacity 
            style={styles.refreshBtn}
            onPress={isDevUser ? handleResetAndReload : () => {
              setInitialLoadDone(false);
              setSessionStats({ played: 0, correct: 0, bestStreak: 0, categoryStats: {} });
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
          </TouchableOpacity> */}
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
          <Text style={styles.headerTitle}>dubdub</Text>
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
        {/* Question View - Always visible */}
        {currentPlayable ? (
          currentPlayable.type === 'chess_mate_in_2' ? (
            <ChessPuzzleCard
              playable={currentPlayable}
              onPuzzleSolved={handleChessPuzzleSolved}
              onPuzzleFailed={handleChessPuzzleFailed}
              currentIndex={currentIndex}
              totalCount={playables.length}
            />
          ) : (
            <PlayableCard
              playable={currentPlayable}
              onAnswer={handleAnswer}
              onGuessAnswer={handleGuessAnswer}
              submitting={isSubmitting}
              currentIndex={currentIndex}
              totalCount={playables.length}
            />
          )
        ) : (
          // Fallback during transition - show loading indicator
          <View style={styles.transitionContainer}>
            <Ionicons name="infinite" size={48} color="#00FF87" />
          </View>
        )}

        {/* Feedback Overlay - Appears on top of question */}
        <FeedbackOverlay
          visible={showFeedback && feedbackData !== null}
          correct={feedbackData?.correct || false}
          correctAnswer={feedbackData?.correct_answer}
          answerExplanation={feedbackData?.answer_explanation}
          currentStreak={feedbackData?.current_streak || user?.current_streak || 0}
          previousStreak={feedbackData?.previousStreak || previousStreak}
          hintsUsed={feedbackData?.hints_used}
          category={feedbackData?.category || currentPlayable?.category}
          categoryCorrectCount={feedbackData?.categoryCorrectCount || 0}
        />
      </Animated.View>
      
      {/* Swipe hint - Only show for text questions (immersive layouts, guess_the_x, and chess have their own) */}
      {(() => {
        const isMediaQuestion = currentPlayable && 
          (currentPlayable.type === 'video' || currentPlayable.type === 'video_text' || 
           currentPlayable.type === 'image' || currentPlayable.type === 'image_text' ||
           currentPlayable.type === 'guess_the_x' || currentPlayable.type === 'chess_mate_in_2') &&
          (currentPlayable.question?.video_url || currentPlayable.question?.image_base64 || currentPlayable.question?.image_url || currentPlayable.hints || currentPlayable.fen);
        
        // Don't show external hints for immersive media questions
        if (isMediaQuestion) return null;
        
        return (
          <View style={styles.swipeHintBottom}>
            <Ionicons name="chevron-up" size={24} color="#444" />
            <Text style={styles.swipeHintText}>
              {showFeedback ? "Swipe up for next" : "Swipe up to skip"}
            </Text>
          </View>
        );
      })()}
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
    minWidth: 70,
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
    textAlign: 'center',
  },
  logoutButton: {
    padding: 8,
    minWidth: 70,
    alignItems: 'flex-end',
  },
  cardWrapper: {
    flex: 1,
  },
  transitionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  // Enhanced End of Session styles
  trophyContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  percentileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 12,
    marginBottom: 8,
  },
  percentileText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00FF87',
  },
  achievementsContainer: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  achievementsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textAlign: 'center',
  },
  achievementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  achievementIcon: {
    fontSize: 24,
  },
  achievementTextContainer: {
    flex: 1,
  },
  achievementTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
  },
  achievementDesc: {
    fontSize: 12,
    color: '#AAA',
    marginTop: 2,
  },
  bestCategoryBadge: {
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginTop: 16,
    width: '100%',
  },
  bestCategoryLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  bestCategoryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00D9FF',
  },
  returnHook: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  shareBtn: {
    marginTop: 24,
    borderRadius: 28,
    overflow: 'hidden',
    width: '100%',
  },
  shareGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  shareText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  swipeUpHint: {
    alignItems: 'center',
    marginTop: 24,
    paddingBottom: 16,
  },
  swipeUpText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
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
