import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface PlayableCardProps {
  playable: any;
  onAnswer: (answer: string) => void;
  submitting: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export default function PlayableCard({ playable, onAnswer, submitting, currentIndex = 0, totalCount = 0 }: PlayableCardProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // Safety check
  if (!playable) {
    return null;
  }

  // Reset state when playable changes
  useEffect(() => {
    setHasSubmitted(false);
    setUserAnswer('');
    setSelectedOption(null);
  }, [playable.playable_id]);

  const handleSubmit = () => {
    if (hasSubmitted || submitting) return;
    
    const answer = playable.answer_type === 'mcq' ? selectedOption : userAnswer;
    if (answer) {
      Keyboard.dismiss();
      setHasSubmitted(true);
      onAnswer(answer);
    }
  };

  const canSubmit = playable.answer_type === 'mcq' 
    ? selectedOption !== null 
    : userAnswer.trim().length > 0;

  // Check if this question has media
  const getMediaSource = () => {
    const { question, type } = playable;
    if ((type === 'video' || type === 'video_text') && question.video_url) {
      return { type: 'video', uri: question.video_url };
    }
    const imageSource = question.image_base64 || question.image_url;
    if ((type === 'image' || type === 'image_text') && imageSource) {
      return { type: 'image', uri: imageSource };
    }
    return null;
  };

  const mediaSource = getMediaSource();
  const isImmersive = mediaSource !== null;

  // ============ IMMERSIVE LAYOUT (Image/Video) ============
  if (isImmersive) {
    return (
      <KeyboardAvoidingView 
        style={styles.immersiveContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Full-screen Media Background */}
        <View style={styles.fullScreenMedia}>
          {/* Background Media - Absolute positioned */}
          {mediaSource.type === 'image' ? (
            <Image
              source={{ uri: mediaSource.uri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
          ) : Platform.OS === 'web' ? (
            // Web: Use native HTML5 video for better compatibility
            <View style={[StyleSheet.absoluteFillObject, styles.videoContainer]}>
              <video
                src={mediaSource.uri}
                autoPlay
                loop
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
              />
            </View>
          ) : (
            // Native: Use expo-av Video
            <Video
              source={{ uri: mediaSource.uri }}
              style={StyleSheet.absoluteFillObject}
              useNativeControls={false}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isLooping={true}
              isMuted={true}
            />
          )}
          
          {/* Overlay Content - On top of media */}
          {renderImmersiveOverlay()}
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ============ STANDARD LAYOUT (Text only) ============
  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Category Badge */}
        <View style={styles.categoryBadge}>
          <LinearGradient
            colors={['#00FF87', '#00D9FF']}
            style={styles.categoryGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.categoryText}>{playable.category}</Text>
          </LinearGradient>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={2}>{playable.title}</Text>

        {/* Question Text */}
        {playable.question.text && (
          <Text style={styles.questionText}>
            {playable.question.text}
          </Text>
        )}

        {/* Spacer */}
        <View style={styles.spacerLarge} />

        {/* Answer Options or Text Input */}
        {renderMCQOptions()}
        {renderTextInput()}
      </ScrollView>

      {/* Submit Button */}
      <View style={styles.submitSection}>
        {renderSubmitButton()}
      </View>
    </KeyboardAvoidingView>
  );

  // ============ RENDER FUNCTIONS ============

  function renderImmersiveOverlay() {
    return (
      <View style={styles.immersiveOverlay}>
        {/* Top Section - Category & Progress on same line, Title below */}
        <View style={styles.topSection}>
          <View style={styles.topRow}>
            {/* Category Badge */}
            <View style={styles.immersiveCategoryBadge}>
              <LinearGradient
                colors={['#00FF87', '#00D9FF']}
                style={styles.categoryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.categoryText}>{playable.category}</Text>
              </LinearGradient>
            </View>
            {/* Progress Badge - Black with white text */}
            {totalCount > 0 && (
              <View style={styles.progressBadge}>
                <Text style={styles.progressBadgeText}>
                  {currentIndex + 1} / {totalCount}
                </Text>
              </View>
            )}
          </View>
          {/* Title right after category */}
          <Text style={styles.immersiveTitle}>{playable.title}</Text>
        </View>

        {/* Bottom Half - Question, Options */}
        <View style={styles.bottomHalf}>
          {/* Question Card - More transparent */}
          {playable.question.text && (
            <View style={styles.questionCard}>
              <Text style={styles.immersiveQuestion}>{playable.question.text}</Text>
            </View>
          )}

          {/* MCQ Options with reduced opacity */}
          {playable.answer_type === 'mcq' && playable.options && (
            <View style={styles.immersiveOptionsGrid}>
              {playable.options.map((option: string, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.glassOption,
                    selectedOption === option && styles.glassOptionSelected,
                  ]}
                  onPress={() => setSelectedOption(option)}
                  activeOpacity={0.8}
                >
                  <View style={styles.glassOptionInner}>
                    <Text
                      style={[
                        styles.glassOptionText,
                        selectedOption === option && styles.glassOptionTextSelected,
                      ]}
                      numberOfLines={2}
                    >
                      {option}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Text Input with reduced opacity */}
          {playable.answer_type === 'text_input' && (
            <View style={styles.immersiveInputContainer}>
              <View style={styles.glassInputWrapper}>
                <TextInput
                  style={styles.immersiveTextInput}
                  placeholder="Type your answer..."
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={userAnswer}
                  onChangeText={setUserAnswer}
                  autoCapitalize="words"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
            </View>
          )}

          {/* Submit Button */}
          <View style={styles.immersiveSubmitSection}>
            {renderSubmitButton()}
          </View>

          {/* Swipe hint - Bottom center */}
          <View style={styles.swipeHintOverlay}>
            <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.5)" />
            <Text style={styles.swipeHintOverlayText}>Swipe up to skip</Text>
          </View>
        </View>
      </View>
    );
  }

  function renderMCQOptions() {
    if (playable.answer_type !== 'mcq' || !playable.options) return null;

    return (
      <View style={styles.optionsGrid}>
        {playable.options.map((option: string, index: number) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.optionButton,
              selectedOption === option && styles.optionButtonSelected,
            ]}
            onPress={() => setSelectedOption(option)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.optionText,
                selectedOption === option && styles.optionTextSelected,
              ]}
              numberOfLines={2}
            >
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderTextInput() {
    if (playable.answer_type !== 'text_input') return null;

    return (
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Type your answer..."
          placeholderTextColor="#666"
          value={userAnswer}
          onChangeText={setUserAnswer}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => Keyboard.dismiss()}
        />
      </View>
    );
  }

  function renderSubmitButton() {
    return (
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={!canSubmit || submitting}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={canSubmit && !submitting ? ['#00FF87', '#00D9FF'] : ['#3A3A4A', '#2A2A3A']}
          style={styles.submitGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={[
            styles.submitButtonText,
            { color: canSubmit && !submitting ? '#0F0F1E' : '#888' }
          ]}>
            {submitting ? 'Checking...' : 'Submit'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
}

const styles = StyleSheet.create({
  // ============ STANDARD LAYOUT STYLES ============
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  categoryGradient: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F0F1E',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
    lineHeight: 30,
  },
  questionText: {
    fontSize: 18,
    color: '#E0E0E0',
    lineHeight: 26,
  },
  spacerLarge: {
    height: 32,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  optionButton: {
    width: '47%',
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2A2A3E',
    minHeight: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionButtonSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: 'rgba(91, 141, 239, 0.15)',
  },
  optionText: {
    fontSize: 15,
    color: '#E0E0E0',
    textAlign: 'center',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  inputContainer: {
    marginTop: 8,
  },
  textInput: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2A2A3E',
  },
  submitSection: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 12,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },

  // ============ IMMERSIVE LAYOUT STYLES ============
  immersiveContainer: {
    flex: 1,
  },
  fullScreenMedia: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  videoContainer: {
    backgroundColor: '#000',
  },
  immersiveOverlay: {
    flex: 1,
    zIndex: 10,
  },
  topSection: {
    paddingTop: Platform.OS === 'ios' ? 20 : 16,
    paddingHorizontal: 16,
  },
  immersiveCategoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 8,
  },
  immersiveTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  bottomHalf: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
  },
  questionCard: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  immersiveQuestion: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.95)',
    textAlign: 'left',
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  immersiveOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  glassOption: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  glassOptionSelected: {
    borderColor: '#00FF87',
    backgroundColor: 'rgba(0,255,135,0.15)',
  },
  glassOptionInner: {
    padding: 14,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glassOptionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontWeight: '600',
  },
  glassOptionTextSelected: {
    color: '#00FF87',
    fontWeight: '700',
  },
  immersiveInputContainer: {
    marginBottom: 12,
  },
  glassInputWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  immersiveTextInput: {
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  immersiveSubmitSection: {
    marginBottom: 8,
  },
  swipeHintOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  swipeHintOverlayText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
});
