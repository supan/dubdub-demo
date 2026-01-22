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
  hintsUsed?: number;
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
      // Animate in
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
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
      // Reset for next time
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.8);
    }
  }, [visible]);

  if (!visible) return null;

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

          {/* Result Text */}
          <Text style={[
            styles.resultText,
            { color: correct ? "#00FF87" : "#FF6B6B" }
          ]}>
            {correct ? "Correct!" : "Wrong"}
          </Text>

          {/* Correct Answer (for wrong answers) */}
          {!correct && correctAnswer && (
            <View style={styles.answerRow}>
              <Text style={styles.answerLabel}>Answer:</Text>
              <Text style={styles.answerValue}>{correctAnswer}</Text>
            </View>
          )}

          {/* Hints Used (for Guess the X) */}
          {hintsUsed !== undefined && correct && (
            <View style={styles.hintsUsedBadge}>
              <Ionicons name="bulb-outline" size={14} color="#FFB800" />
              <Text style={styles.hintsUsedText}>
                Solved with {hintsUsed} hint{hintsUsed !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {/* Explanation (only for wrong answers) */}
          {!correct && answerExplanation && (
            <View style={styles.explanationBox}>
              <View style={styles.explanationHeader}>
                <Ionicons name="bulb" size={14} color="#FFB800" />
                <Text style={styles.explanationLabel}>Did you know?</Text>
              </View>
              <Text style={styles.explanationText}>{answerExplanation}</Text>
            </View>
          )}

          {/* Streak Badge */}
          <View style={styles.streakContainer}>
            <Ionicons name="flame" size={18} color="#FF6B00" />
            <Text style={styles.streakText}>{currentStreak} streak</Text>
          </View>

          {/* Swipe Hint */}
          <View style={styles.swipeHint}>
            <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.4)" />
            <Text style={styles.swipeHintText}>Swipe up for next</Text>
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
    maxWidth: 340,
  },
  modalCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 24,
    padding: 32,
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
    marginBottom: 16,
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
    marginBottom: 12,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  answerLabel: {
    fontSize: 14,
    color: '#888',
  },
  answerValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  hintsUsedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 184, 0, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  hintsUsedText: {
    fontSize: 13,
    color: '#FFB800',
    fontWeight: '500',
  },
  explanationBox: {
    backgroundColor: 'rgba(255, 184, 0, 0.08)',
    borderRadius: 12,
    padding: 14,
    width: '100%',
    marginBottom: 16,
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
    marginBottom: 20,
  },
  streakText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B00',
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  swipeHintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '500',
  },
});
