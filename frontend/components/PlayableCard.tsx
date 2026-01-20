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
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';

interface PlayableCardProps {
  playable: any;
  onAnswer: (answer: string) => void;
  submitting: boolean;
}

export default function PlayableCard({ playable, onAnswer, submitting }: PlayableCardProps) {
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
  const hasMedia = () => {
    const { question, type } = playable;
    if ((type === 'video' || type === 'video_text') && question.video_url) return true;
    const imageSource = question.image_base64 || question.image_url;
    if ((type === 'image' || type === 'image_text') && imageSource) return true;
    return false;
  };

  const renderMedia = () => {
    const { question, type } = playable;

    if ((type === 'video' || type === 'video_text') && question.video_url) {
      return (
        <View style={styles.mediaContainer}>
          <Video
            source={{ uri: question.video_url }}
            style={styles.media}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={true}
            isLooping={false}
            isMuted={false}
          />
        </View>
      );
    }

    const imageSource = question.image_base64 || question.image_url;
    if ((type === 'image' || type === 'image_text') && imageSource) {
      return (
        <View style={styles.mediaContainer}>
          <Image
            source={{ uri: imageSource }}
            style={styles.media}
            resizeMode="cover"
          />
        </View>
      );
    }

    return null;
  };

  const renderMCQOptions = () => {
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
  };

  const renderTextInput = () => {
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
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Scrollable content area */}
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

        {/* Media (Image/Video) - only if present */}
        {renderMedia()}

        {/* Question Text */}
        {playable.question.text && (
          <Text style={styles.questionText}>
            {playable.question.text}
          </Text>
        )}

        {/* Spacer - adaptive based on whether there's media */}
        <View style={hasMedia() ? styles.spacerSmall : styles.spacerLarge} />

        {/* Answer Options or Text Input */}
        {renderMCQOptions()}
        {renderTextInput()}
      </ScrollView>

      {/* Submit Button - Fixed at bottom */}
      <View style={styles.submitSection}>
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
      </View>
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
  mediaContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#1E1E2E',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  questionText: {
    fontSize: 18,
    color: '#E0E0E0',
    lineHeight: 26,
  },
  spacerSmall: {
    height: 20,
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
});
