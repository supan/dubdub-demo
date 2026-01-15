import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

interface FeedbackModalProps {
  visible: boolean;
  correct: boolean;
  correctAnswer: string;
  currentStreak: number;
  onSwipeUp: () => void;
}

export default function FeedbackModal({
  visible,
  correct,
  correctAnswer,
  currentStreak,
  onSwipeUp,
}: FeedbackModalProps) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [buttonDisabled, setButtonDisabled] = useState(false);

  useEffect(() => {
    if (visible) {
      setButtonDisabled(false); // Reset button state when modal opens
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      scaleAnim.setValue(0);
      fadeAnim.setValue(0);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View
          style={[
            styles.container,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={correct ? ['#00FF87', '#00D9FF'] : ['#FF6B6B', '#FF8E53']}
            style={styles.gradient}
          >
            {/* Icon */}
            <View style={styles.iconContainer}>
              {correct ? (
                <Ionicons name="checkmark-circle" size={80} color="#0F0F1E" />
              ) : (
                <Ionicons name="close-circle" size={80} color="#0F0F1E" />
              )}
            </View>

            {/* Title */}
            <Text style={styles.title}>
              {correct ? 'Correct! 🎉' : 'Not quite!'}
            </Text>

            {/* Message */}
            {correct ? (
              <View style={styles.messageContainer}>
                <Text style={styles.message}>You got it right!</Text>
                {currentStreak > 1 && (
                  <View style={styles.streakContainer}>
                    <Ionicons name="flame" size={24} color="#FF6B00" />
                    <Text style={styles.streakText}>
                      {currentStreak} in a row!
                    </Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.messageContainer}>
                <Text style={styles.message}>The correct answer is:</Text>
                <View style={styles.correctAnswerBox}>
                  <Text style={styles.correctAnswerText}>{correctAnswer}</Text>
                </View>
              </View>
            )}

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.continueButton, buttonDisabled && styles.continueButtonDisabled]}
              onPress={() => {
                if (!buttonDisabled) {
                  setButtonDisabled(true);
                  onSwipeUp();
                }
              }}
              activeOpacity={0.8}
              disabled={buttonDisabled}
            >
              <View style={styles.continueButtonContent}>
                <Text style={styles.continueButtonText}>Continue</Text>
                <Ionicons name="arrow-forward" size={20} color="#0F0F1E" />
              </View>
            </TouchableOpacity>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    width: width - 40,
    maxWidth: 400,
    borderRadius: 24,
    overflow: 'hidden',
  },
  gradient: {
    padding: 32,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#0F0F1E',
    marginBottom: 16,
    textAlign: 'center',
  },
  messageContainer: {
    alignItems: 'center',
    marginBottom: 24,
    width: '100%',
  },
  message: {
    fontSize: 18,
    color: '#0F0F1E',
    marginBottom: 12,
    textAlign: 'center',
    fontWeight: '600',
  },
  streakContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 0, 0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 0, 0.3)',
  },
  streakText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FF6B00',
  },
  correctAnswerBox: {
    backgroundColor: 'rgba(15, 15, 30, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 8,
  },
  correctAnswerText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F0F1E',
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: '#0F0F1E',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    width: '100%',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00FF87',
  },
});
