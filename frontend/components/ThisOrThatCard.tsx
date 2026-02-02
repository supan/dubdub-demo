import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const IMAGE_SIZE = (SCREEN_WIDTH - 60) / 2;

interface ThisOrThatCardProps {
  question: {
    text?: string;
    image_left?: string;
    image_right?: string;
    label_left?: string;
    label_right?: string;
  };
  correctAnswer: string;
  onAnswer: (answer: string, isCorrect: boolean) => void;
  disabled?: boolean;
}

export default function ThisOrThatCard({
  question,
  correctAnswer,
  onAnswer,
  disabled = false,
}: ThisOrThatCardProps) {
  const [selectedSide, setSelectedSide] = useState<'left' | 'right' | null>(null);
  const [loadingLeft, setLoadingLeft] = useState(true);
  const [loadingRight, setLoadingRight] = useState(true);
  
  const leftScale = useRef(new Animated.Value(1)).current;
  const rightScale = useRef(new Animated.Value(1)).current;
  const leftOpacity = useRef(new Animated.Value(1)).current;
  const rightOpacity = useRef(new Animated.Value(1)).current;

  const handleSelect = (side: 'left' | 'right') => {
    if (disabled || selectedSide) return;
    
    const selectedLabel = side === 'left' ? question.label_left : question.label_right;
    const isCorrect = selectedLabel === correctAnswer;
    
    setSelectedSide(side);
    
    // Animate selection
    if (side === 'left') {
      Animated.sequence([
        Animated.timing(leftScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
        Animated.timing(leftScale, { toValue: 1.02, duration: 100, useNativeDriver: true }),
        Animated.timing(leftScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      Animated.timing(rightOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }).start();
    } else {
      Animated.sequence([
        Animated.timing(rightScale, { toValue: 0.95, duration: 100, useNativeDriver: true }),
        Animated.timing(rightScale, { toValue: 1.02, duration: 100, useNativeDriver: true }),
        Animated.timing(rightScale, { toValue: 1, duration: 100, useNativeDriver: true }),
      ]).start();
      Animated.timing(leftOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }).start();
    }
    
    // Delay callback slightly for animation
    setTimeout(() => {
      onAnswer(selectedLabel || '', isCorrect);
    }, 400);
  };

  return (
    <View style={styles.container}>
      {/* Question Text */}
      {question.text && (
        <View style={styles.questionContainer}>
          <Text style={styles.questionText}>{question.text}</Text>
        </View>
      )}

      {/* Two Images Side by Side */}
      <View style={styles.imagesContainer}>
        {/* Left Image */}
        <Animated.View style={[
          styles.imageWrapper,
          { transform: [{ scale: leftScale }], opacity: leftOpacity }
        ]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => handleSelect('left')}
            disabled={disabled || !!selectedSide}
            style={[
              styles.imageButton,
              selectedSide === 'left' && styles.imageButtonSelected,
            ]}
          >
            <LinearGradient
              colors={
                selectedSide === 'left'
                  ? ['rgba(0,255,135,0.2)', 'rgba(0,255,135,0.05)']
                  : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']
              }
              style={styles.imageGradient}
            >
              {loadingLeft && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#00FF87" size="small" />
                </View>
              )}
              <Image
                source={{ uri: question.image_left }}
                style={styles.image}
                resizeMode="contain"
                onLoad={() => setLoadingLeft(false)}
              />
            </LinearGradient>
            {selectedSide === 'left' && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* OR Divider */}
        <View style={styles.orDivider}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>OR</Text>
          <View style={styles.orLine} />
        </View>

        {/* Right Image */}
        <Animated.View style={[
          styles.imageWrapper,
          { transform: [{ scale: rightScale }], opacity: rightOpacity }
        ]}>
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => handleSelect('right')}
            disabled={disabled || !!selectedSide}
            style={[
              styles.imageButton,
              selectedSide === 'right' && styles.imageButtonSelected,
            ]}
          >
            <LinearGradient
              colors={
                selectedSide === 'right'
                  ? ['rgba(0,255,135,0.2)', 'rgba(0,255,135,0.05)']
                  : ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.02)']
              }
              style={styles.imageGradient}
            >
              {loadingRight && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#00FF87" size="small" />
                </View>
              )}
              <Image
                source={{ uri: question.image_right }}
                style={styles.image}
                resizeMode="contain"
                onLoad={() => setLoadingRight(false)}
              />
            </LinearGradient>
            {selectedSide === 'right' && (
              <View style={styles.selectedIndicator}>
                <Text style={styles.selectedText}>✓</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Tap Hint */}
      {!selectedSide && (
        <Text style={styles.tapHint}>Tap to select</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
    alignItems: 'center',
  },
  questionContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginBottom: 24,
    width: '100%',
  },
  questionText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 28,
  },
  imagesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageWrapper: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE + 20,
  },
  imageButton: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  imageButtonSelected: {
    borderColor: '#00FF87',
    borderWidth: 3,
  },
  imageGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 18,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#00FF87',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '800',
  },
  orDivider: {
    alignItems: 'center',
    justifyContent: 'center',
    height: IMAGE_SIZE,
    paddingHorizontal: 4,
  },
  orLine: {
    width: 1,
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  orText: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.5)',
    paddingVertical: 8,
  },
  tapHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    marginTop: 20,
  },
});
