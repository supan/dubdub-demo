import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
}

export default function FeedbackOverlay({
  visible,
  correct,
  correctAnswer,
  answerExplanation,
  currentStreak = 0,
  hintsUsed,
}: FeedbackOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (visible) {
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
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible]);

  if (!visible) return null;

  // Simple streak message only for significant streaks
  const getStreakLabel = () => {
    if (currentStreak >= 10) return "🔥 On Fire!";
    if (currentStreak >= 5) return "🔥 Hot Streak!";
    if (currentStreak >= 3) return "🔥 Nice!";
    return null;
  };

  const streakLabel = correct ? getStreakLabel() : null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
      {/* Blur Background */}
      <BlurView intensity={Platform.OS === 'ios' ? 30 : 100} tint="dark" style={styles.blurContainer}>
        <View style={styles.dimOverlay} />
      </BlurView>

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

          {/* Result Text + Streak (combined) */}
          <Text style={[
            styles.resultText,
            { color: correct ? "#00FF87" : "#FF6B6B" }
          ]}>
            {correct ? "Correct!" : "Wrong"}
          </Text>

          {/* Streak label (only for significant streaks) */}
          {streakLabel && (
            <Text style={styles.streakLabel}>{streakLabel}</Text>
          )}

          {/* For WRONG answers: Show correct answer prominently */}
          {!correct && correctAnswer && (
            <View style={styles.answerSection}>
              <Text style={styles.answerLabel}>Answer</Text>
              <Text style={styles.answerValue}>{correctAnswer}</Text>
              {answerExplanation && (
                <Text style={styles.explanation}>{answerExplanation}</Text>
              )}
            </View>
          )}

          {/* For CORRECT answers with hints: Show hints used */}
          {correct && hintsUsed !== undefined && hintsUsed > 0 && (
            <Text style={styles.hintsText}>
              Solved with {hintsUsed} hint{hintsUsed !== 1 ? 's' : ''}
            </Text>
          )}

          {/* Streak Counter */}
          <View style={styles.streakBadge}>
            <Ionicons name="flame" size={16} color="#FF6B00" />
            <Text style={styles.streakCount}>{currentStreak}</Text>
          </View>

          {/* Swipe Hint */}
          <View style={styles.swipeHint}>
            <Ionicons name="chevron-up" size={18} color="rgba(255,255,255,0.3)" />
            <Text style={styles.swipeText}>Swipe up</Text>
          </View>
        </View>
      </Animated.View>
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
  modalContainer: {
    width: SCREEN_WIDTH - 48,
    maxWidth: 320,
  },
  modalCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalCorrect: {
    borderColor: 'rgba(0, 255, 135, 0.4)',
  },
  modalIncorrect: {
    borderColor: 'rgba(255, 107, 107, 0.4)',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconCorrect: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
  },
  iconIncorrect: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  resultText: {
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  streakLabel: {
    fontSize: 15,
    color: '#FFD700',
    fontWeight: '600',
    marginBottom: 12,
  },
  // Wrong answer section
  answerSection: {
    backgroundColor: 'rgba(0, 255, 135, 0.08)',
    borderRadius: 12,
    padding: 16,
    width: '100%',
    marginTop: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  answerLabel: {
    fontSize: 11,
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  answerValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#00FF87',
    textAlign: 'center',
  },
  explanation: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  // Hints text
  hintsText: {
    fontSize: 13,
    color: '#FFB800',
    marginTop: 8,
    marginBottom: 4,
  },
  // Streak badge (compact)
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
    marginBottom: 12,
  },
  streakCount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF6B00',
  },
  // Swipe hint
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swipeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
});
