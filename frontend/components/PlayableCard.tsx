import React, { useState } from 'react';
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

  const handleSubmit = () => {
    const answer = playable.answer_type === 'mcq' ? selectedOption : userAnswer;
    if (answer && !submitting) {
      onAnswer(answer);
    }
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
              resizeMode="contain"
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
          style={styles.textInput}
          placeholder="Type your answer..."
          placeholderTextColor="#999"
          value={userAnswer}
          onChangeText={setUserAnswer}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>
    );
  };

  const canSubmit = playable.answer_type === 'mcq' ? selectedOption !== null : userAnswer.trim().length > 0;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Category Badge */}
        <View style={styles.categoryBadge}>
          <LinearGradient
            colors={['#FF6B9D', '#C06C84']}
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

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!canSubmit || submitting) && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={canSubmit && !submitting ? ['#667eea', '#764ba2'] : ['#ccc', '#999']}
            style={styles.submitGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {submitting ? (
              <Text style={styles.submitButtonText}>Submitting...</Text>
            ) : (
              <View style={styles.submitContent}>
                <Text style={styles.submitButtonText}>Submit Answer</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
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
    fontWeight: '600',
    color: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  questionText: {
    fontSize: 18,
    color: '#555',
    lineHeight: 26,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  optionButtonSelected: {
    borderColor: '#667eea',
    backgroundColor: '#f0f4ff',
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
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionCircleSelected: {
    borderColor: '#667eea',
  },
  optionCircleInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#667eea',
  },
  optionText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  optionTextSelected: {
    fontWeight: '600',
    color: '#667eea',
  },
  textInputContainer: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    minHeight: 60,
  },
  submitButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
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
    fontWeight: 'bold',
    color: '#fff',
  },
});
