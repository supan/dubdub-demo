import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const AUTO_ADVANCE_DURATION = 4000; // 4 seconds

interface FeedbackOverlayProps {
  visible: boolean;
  correct: boolean;
  correctAnswer?: string;
  answerExplanation?: string;
  currentStreak?: number;
  previousStreak?: number;
  hintsUsed?: number;
  category?: string;
  categoryCorrectCount?: number;
  timeTaken?: number;  // Time taken in seconds
  avgTime?: number;    // Average time in seconds (placeholder for now)
  onAutoAdvance?: () => void; // Callback when timer completes
}

// Single psychological message based on context
const getCorrectMessage = (streak: number): string | null => {
  if (streak >= 10) return "Legendary! 👑";
  if (streak >= 7) return "Unstoppable! 🌟";
  if (streak >= 5) return "On fire! 🔥";
  if (streak >= 3) return "Hat-trick! 🎩";
  if (streak === 2) return "Double up! ✨";
  if (streak === 1) return "Nice one! 💪";
  return null;
};

const getWrongMessage = (previousStreak: number): string => {
  if (previousStreak >= 5) return "Fresh start! Let's go 💪";
  if (previousStreak >= 3) return "Streak reset, comeback time!";
  return "Now you know! 📈";
};

export default function FeedbackOverlay({
  visible,
  correct,
  correctAnswer,
  answerExplanation,
  currentStreak = 0,
  previousStreak = 0,
  hintsUsed,
  timeTaken,
  avgTime,
  onAutoAdvance,
}: FeedbackOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<Animated.CompositeAnimation | null>(null);
  
  // Track elapsed time for accurate pause/resume
  const startTimeRef = useRef<number>(0);
  const elapsedBeforePauseRef = useRef<number>(0);

  // Determine the single psychological message to show
  const psychMessage = useMemo(() => {
    if (correct) {
      // If hints used < 2, use that as the message (impressive solve)
      if (hintsUsed !== undefined && hintsUsed < 2) {
        if (hintsUsed === 0) return "No hints needed! 🧠";
        return "Just 1 hint! Sharp! 🎯";
      }
      // Otherwise, show streak-based message
      return getCorrectMessage(currentStreak);
    } else {
      return getWrongMessage(previousStreak);
    }
  }, [correct, currentStreak, previousStreak, hintsUsed]);

  // Start/reset timer when overlay becomes visible
  useEffect(() => {
    if (visible) {
      // Reset progress
      progressAnim.setValue(0);
      elapsedBeforePauseRef.current = 0;
      setIsPaused(false);

      // Start entrance animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start();

      // Start progress bar animation
      startProgressTimer(0);
    } else {
      // Reset all animations when hidden
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
      progressAnim.setValue(0);
      if (timerRef.current) {
        timerRef.current.stop();
        timerRef.current = null;
      }
    }
  }, [visible]);

  const startProgressTimer = (elapsedMs: number) => {
    const remainingDuration = AUTO_ADVANCE_DURATION - elapsedMs;
    const startValue = elapsedMs / AUTO_ADVANCE_DURATION;
    
    // Set the progress bar to current position
    progressAnim.setValue(startValue);
    
    // Record start time for pause tracking
    startTimeRef.current = Date.now();
    
    timerRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remainingDuration,
      useNativeDriver: false, // Can't use native driver for width
    });

    timerRef.current.start(({ finished }) => {
      if (finished && onAutoAdvance) {
        onAutoAdvance();
      }
    });
  };

  const handlePressIn = () => {
    setIsPaused(true);
    if (timerRef.current) {
      timerRef.current.stop();
    }
    // Calculate total elapsed time including previous pauses
    const currentSessionElapsed = Date.now() - startTimeRef.current;
    elapsedBeforePauseRef.current += currentSessionElapsed;
  };

  const handlePressOut = () => {
    setIsPaused(false);
    // Resume from where we left off
    startProgressTimer(elapsedBeforePauseRef.current);
  };

  if (!visible) return null;

  // Progress bar color: green for correct, white for incorrect
  const progressBarColor = correct ? '#00FF87' : '#FFFFFF';

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {/* Blur Background */}
      <BlurView intensity={Platform.OS === 'ios' ? 30 : 100} tint="dark" style={styles.blurContainer}>
        <View style={styles.dimOverlay} />
      </BlurView>

      {/* Pressable wrapper for tap to pause */}
      <Pressable 
        style={styles.pressableArea}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {/* Progress Bar at Top - Full width, no spacing */}
        <View style={styles.progressBarContainer}>
          <Animated.View 
            style={[
              styles.progressBarFill,
              { 
                backgroundColor: progressBarColor,
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
                opacity: isPaused ? 0.5 : 1,
              }
            ]} 
          />
        </View>

        {/* Modal Card */}
        <Animated.View 
          style={[
            styles.modalContainer,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          <View style={[
            styles.modalCard,
            correct ? styles.modalCorrect : styles.modalIncorrect
          ]}>
            {/* Result Icon */}
            <View style={[
              styles.iconContainer,
              correct ? styles.iconCorrect : styles.iconIncorrect
            ]}>
              <Ionicons 
                name={correct ? "checkmark" : "close"} 
                size={48} 
                color={correct ? "#00FF87" : "#FF6B6B"} 
              />
            </View>

            {/* Result Text */}
            <Text style={[
              styles.resultText,
              { color: correct ? "#00FF87" : "#FF6B6B" }
            ]}>
              {correct ? "Correct!" : "Wrong"}
            </Text>

            {/* Single Psychological Message */}
            {psychMessage && (
              <Text style={styles.psychMessage}>{psychMessage}</Text>
            )}

            {/* Time Display - Only for correct answers */}
            {correct && timeTaken !== undefined && (
              <View style={styles.timeContainer}>
                <View style={styles.timeRow}>
                  <Ionicons name="timer-outline" size={16} color="#00D9FF" />
                  <Text style={styles.timeText}>{timeTaken.toFixed(1)}s</Text>
                </View>
                {avgTime !== undefined && (
                  <Text style={styles.avgTimeText}>Avg: {avgTime.toFixed(1)}s</Text>
                )}
              </View>
            )}

            {/* Correct Answer (for wrong answers only) */}
            {!correct && correctAnswer && (
              <View style={styles.answerBox}>
                <Text style={styles.answerLabel}>Answer</Text>
                <Text style={styles.answerValue}>{correctAnswer}</Text>
              </View>
            )}

            {/* Explanation (for wrong answers only) */}
            {!correct && answerExplanation && (
              <View style={styles.explanationBox}>
                <View style={styles.explanationHeader}>
                  <Ionicons name="bulb" size={14} color="#FFB800" />
                  <Text style={styles.explanationLabel}>Did you know?</Text>
                </View>
                <Text style={styles.explanationText}>{answerExplanation}</Text>
              </View>
            )}

            {/* Streak Container */}
            <View style={[
              styles.streakContainer,
              currentStreak >= 5 && styles.streakContainerHot
            ]}>
              <Ionicons 
                name="flame" 
                size={18} 
                color={currentStreak >= 5 ? "#FFD700" : "#FF6B00"} 
              />
              <Text style={[
                styles.streakText,
                currentStreak >= 5 && styles.streakTextHot
              ]}>
                {currentStreak} streak
              </Text>
            </View>
          </View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  pressableArea: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 101,
  },
  progressBarFill: {
    height: '100%',
  },
  modalContainer: {
    width: SCREEN_WIDTH - 48,
    maxWidth: 340,
  },
  modalCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalCorrect: {
    borderColor: 'rgba(0, 255, 135, 0.5)',
  },
  modalIncorrect: {
    borderColor: 'rgba(255, 107, 107, 0.5)',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCorrect: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
  },
  iconIncorrect: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  resultText: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  psychMessage: {
    fontSize: 15,
    color: '#FFD700',
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 12,
    marginBottom: 16,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#00D9FF',
  },
  avgTimeText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '500',
  },
  answerBox: {
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  answerLabel: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  answerValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#00FF87',
    textAlign: 'center',
  },
  explanationBox: {
    backgroundColor: 'rgba(255, 184, 0, 0.08)',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 12,
  },
  explanationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFB800',
  },
  explanationText: {
    fontSize: 13,
    color: '#BBB',
    lineHeight: 18,
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.15)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  streakContainerHot: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  streakText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B00',
  },
  streakTextHot: {
    color: '#FFD700',
  },
});
