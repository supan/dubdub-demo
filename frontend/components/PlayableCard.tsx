import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  Keyboard,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

interface PlayableCardProps {
  playable: any;
  onAnswer: (answer: string) => void;
  submitting: boolean;
}

export default function PlayableCard({ playable, onAnswer, submitting }: PlayableCardProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const textInputRef = useRef<TextInput>(null);

  // Safety check
  if (!playable) {
    return null;
  }

  // Reset submission state when playable changes
  useEffect(() => {
    setHasSubmitted(false);
    setUserAnswer('');
    setSelectedOption(null);
  }, [playable.playable_id]);

  // Scroll to text input when keyboard appears
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        // Scroll to make sure text input is visible
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
    };
  }, []);

  const handleSubmit = () => {
    if (hasSubmitted || submitting) {
      return; // Prevent double submission
    }
    
    const answer = playable.answer_type === 'mcq' ? selectedOption : userAnswer;
    if (answer) {
      // Dismiss keyboard before submitting
      Keyboard.dismiss();
      setHasSubmitted(true);
      onAnswer(answer);
    }
  };

  // Handle keyboard done/return key - DO NOT submit, just dismiss keyboard
  const handleKeyboardDone = () => {
    // Only dismiss keyboard, don't submit
    Keyboard.dismiss();
  };

  const renderQuestion = () => {
    const { question, type } = playable;

    return (
      <View style={styles.questionContainer}>
        {/* Video */}
        {(type === 'video' || type === 'video_text') && question.video_url && (
          <View style={styles.videoContainer}>
            <Video
              source={{ uri: question.video_url }}
              style={styles.video}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
            />
          </View>
        )}

        {/* Image */}
        {(type === 'image' || type === 'image_text') && question.image_base64 && (
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: question.image_base64 }}
              style={styles.image}
              resizeMode="cover"
            />
          </View>
        )}

        {/* Text Question */}
        {question.text && (
          <Text style={styles.questionText}>{question.text}</Text>
        )}
      </View>
    );
  };

  const renderAnswerInput = () => {
    if (playable.answer_type === 'mcq' && playable.options) {
      return (
        <View style={styles.optionsContainer}>
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
              <View style={styles.optionContent}>
                <View
                  style={[
                    styles.optionCircle,
                    selectedOption === option && styles.optionCircleSelected,
                  ]}
                >
                  {selectedOption === option && (
                    <View style={styles.optionCircleInner} />
                  )}
                </View>
                <Text
                  style={[
                    styles.optionText,
                    selectedOption === option && styles.optionTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      );
    }

    return (
      <View style={styles.textInputContainer}>
        <TextInput
          ref={textInputRef}
          style={styles.textInput}
          placeholder="Type your answer..."
          placeholderTextColor="#666"
          value={userAnswer}
          onChangeText={setUserAnswer}
          autoCapitalize="words"
          returnKeyType="done"
          blurOnSubmit={true}
          onSubmitEditing={handleKeyboardDone}
          onFocus={() => {
            // Scroll to input when focused
            setTimeout(() => {
              scrollViewRef.current?.scrollToEnd({ animated: true });
            }, 200);
          }}
        />
        <Text style={styles.inputHint}>
          Press "Submit Answer" button below when ready
        </Text>
      </View>
    );
  };

  const canSubmit = playable.answer_type === 'mcq' ? selectedOption !== null : userAnswer.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
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
        <Text style={styles.title}>{playable.title}</Text>

        {/* Question Content */}
        {renderQuestion()}

        {/* Answer Input */}
        {renderAnswerInput()}

        {/* Submit Button - Fixed visibility for disabled state */}
        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={canSubmit && !submitting ? ['#00FF87', '#00D9FF'] : ['#4A4A5A', '#3A3A4A']}
            style={styles.submitGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {submitting ? (
              <Text style={[styles.submitButtonText, { color: '#FFFFFF' }]}>Submitting...</Text>
            ) : (
              <View style={styles.submitContent}>
                <Text style={[
                  styles.submitButtonText,
                  { color: canSubmit ? '#0F0F1E' : '#AAAAAA' }
                ]}>
                  Submit Answer
                </Text>
                <Ionicons 
                  name="arrow-forward" 
                  size={20} 
                  color={canSubmit ? '#0F0F1E' : '#AAAAAA'} 
                />
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
        
        {/* Extra padding at bottom for keyboard */}
        <View style={{ height: 50 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  categoryGradient: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  questionContainer: {
    marginBottom: 24,
  },
  videoContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#000',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  imageContainer: {
    width: '100%',
    height: 200,
    backgroundColor: '#2A2A3E',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  questionText: {
    fontSize: 18,
    color: '#E0E0E0',
    lineHeight: 26,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#2A2A3E',
  },
  // Changed from green to blue for selection (neutral color)
  optionButtonSelected: {
    borderColor: '#5B8DEF',
    backgroundColor: 'rgba(91, 141, 239, 0.15)',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  optionCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Changed from green to blue for selection indicator
  optionCircleSelected: {
    borderColor: '#5B8DEF',
  },
  optionCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5B8DEF',
  },
  optionText: {
    fontSize: 16,
    color: '#E0E0E0',
    flex: 1,
  },
  // Changed from green to white for selected text
  optionTextSelected: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
  textInputContainer: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2A2A3E',
    minHeight: 60,
  },
  inputHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '700',
  },
});
