import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

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
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
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

  const swipeGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY < 0) {
        translateY.setValue(event.translationY);
      }
    })
    .onEnd((event) => {
      if (event.velocityY < -500 || event.translationY < -100) {
        Animated.timing(translateY, {
          toValue: -height,
          duration: 300,
          useNativeDriver: true,
        }).start(() => {
          runOnJS(onSwipeUp)();
        });
      } else {
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <GestureDetector gesture={swipeGesture}>
          <Animated.View
            style={[
              styles.container,
              {
                transform: [{ scale: scaleAnim }, { translateY }],
              },
            ]}
          >
            <LinearGradient
              colors={correct ? ['#00FF87', '#00D9FF'] : ['#FF6B6B', '#FF8E53']}
              style={styles.gradient}
            >
              {/* Swipe Indicator */}
              <View style={styles.swipeIndicator}>
                <View style={styles.swipeBar} />
                <Text style={styles.swipeText}>Swipe up for next</Text>
              </View>

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
            </LinearGradient>
          </Animated.View>
        </GestureDetector>
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
  swipeIndicator: {
    alignItems: 'center',
    marginBottom: 16,
  },
  swipeBar: {
    width: 50,
    height: 4,
    backgroundColor: 'rgba(15, 15, 30, 0.3)',
    borderRadius: 2,
    marginBottom: 8,
  },
  swipeText: {
    fontSize: 12,
    color: 'rgba(15, 15, 30, 0.6)',
    fontWeight: '600',
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
    marginBottom: 8,
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
});
