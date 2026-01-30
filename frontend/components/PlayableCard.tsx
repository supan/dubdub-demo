import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { Video, ResizeMode, Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import YoutubePlayer from 'react-native-youtube-iframe';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Helper to extract YouTube video ID from URL
const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  
  // Match various YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\?\/]+)/,
    /youtube\.com\/watch\?.*v=([^&]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
};

// Check if URL is a YouTube URL
const isYouTubeUrl = (url: string): boolean => {
  if (!url) return false;
  return url.includes('youtube.com') || url.includes('youtu.be');
};

interface PlayableCardProps {
  playable: any;
  onAnswer: (answer: string) => void;
  onGuessAnswer?: (answer: string, hintNumber: number) => Promise<any>;  // For guess_the_x
  submitting: boolean;
  currentIndex?: number;
  totalCount?: number;
}

export default function PlayableCard({ playable, onAnswer, onGuessAnswer, submitting, currentIndex = 0, totalCount = 0 }: PlayableCardProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const videoRef = useRef<Video>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  
  // Video playback state - for "watch first, then answer" flow
  const [videoFinished, setVideoFinished] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  
  // Guess the X specific state
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  const [guessResult, setGuessResult] = useState<any>(null);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [wrongGuesses, setWrongGuesses] = useState<string[]>([]);

  // Safety check
  if (!playable) {
    return null;
  }

  // Configure audio mode for video playback (including iOS silent mode)
  useEffect(() => {
    const setupAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
      } catch (error) {
        console.log('Audio mode setup error:', error);
      }
    };
    setupAudio();
  }, []);

  // Reset state when playable changes
  useEffect(() => {
    setHasSubmitted(false);
    setUserAnswer('');
    setSelectedOption(null);
    setCurrentHintIndex(0);
    setGuessResult(null);
    setShowCorrectAnswer(false);
    setVideoFinished(false);
    setIsReplaying(false);
    setWrongGuesses([]);
  }, [playable.playable_id]);

  // Check if this is a video type playable (needed early for autoplay effect)
  const isVideoType = playable.type === 'video' || playable.type === 'video_text';

  // Autoplay video when navigating to a new video question
  useEffect(() => {
    const autoplayVideo = async () => {
      if (videoRef.current && isVideoType) {
        try {
          await videoRef.current.setPositionAsync(0);
          await videoRef.current.playAsync();
        } catch (error) {
          console.log('Video autoplay error:', error);
        }
      }
    };
    
    // Small delay to ensure video source has updated
    const timer = setTimeout(autoplayVideo, 150);
    return () => clearTimeout(timer);
  }, [playable.playable_id, isVideoType]);

  // Handle video playback status
  const handleVideoPlaybackStatus = (status: any) => {
    if (status.didJustFinish && !status.isLooping) {
      setVideoFinished(true);
      setIsReplaying(false);
    }
  };

  // Handle replay button press
  const handleReplay = async () => {
    setVideoFinished(false);
    setIsReplaying(true);
    
    // For YouTube videos, just reset the state - the player will restart
    const videoUrl = playable.question?.video_url;
    if (videoUrl && isYouTubeUrl(videoUrl)) {
      // YouTube player will restart automatically when play prop changes
      return;
    }
    
    // For regular videos, use the video ref
    if (videoRef.current) {
      try {
        await videoRef.current.setPositionAsync(0);
        await videoRef.current.playAsync();
      } catch (error) {
        console.log('Error replaying video:', error);
      }
    }
  };

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

  // ============ GUESS THE X LAYOUT ============
  if (playable.type === 'guess_the_x' && playable.hints) {
    const hints = playable.hints;
    const totalHints = hints.length;
    const hasImage = playable.question?.image_base64 || playable.question?.image_url;
    const imageUri = playable.question?.image_base64 || playable.question?.image_url;
    
    const handleGuessSubmit = async () => {
      if (!userAnswer.trim() || submitting || hasSubmitted) return;
      
      Keyboard.dismiss();
      setHasSubmitted(true);
      
      if (onGuessAnswer) {
        try {
          const result = await onGuessAnswer(userAnswer, currentHintIndex + 1);
          
          if (!result) {
            // API call failed
            setHasSubmitted(false);
            return;
          }
          
          if (result.correct) {
            // Correct! Show success feedback
            setGuessResult(result);
            // Parent will handle transition
          } else if (result.reveal_next_hint) {
            // Wrong, but more hints available - reveal next hint
            setWrongGuesses(prev => [...prev, userAnswer]);
            setCurrentHintIndex(currentHintIndex + 1);
            setUserAnswer('');
            setHasSubmitted(false);
          } else if (result.all_hints_exhausted) {
            // All hints used, show correct answer
            setWrongGuesses(prev => [...prev, userAnswer]);
            setGuessResult(result);
            setShowCorrectAnswer(true);
          }
        } catch (error) {
          console.error('Error submitting guess:', error);
          setHasSubmitted(false);
        }
      }
    };
    
    // Render with or without immersive background
    const renderGuessContent = () => (
      <View style={styles.guessContentWrapper}>
        {/* Top Section - Category, Progress, Title */}
        <View style={styles.guessTopSection}>
          {/* Top Row - Category & Progress */}
          <View style={[styles.guessTopRow, hasImage && styles.guessTopRowImmersive]}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{playable.category}</Text>
            </View>
            {totalCount > 0 && (
              <View style={styles.standardProgressBadge}>
                <Text style={styles.standardProgressText}>
                  {currentIndex + 1} / {totalCount}
                </Text>
              </View>
            )}
          </View>

          {/* Title */}
          <Text style={[styles.title, hasImage && styles.guessTitleImmersive]}>
            {playable.title}
          </Text>

          {/* All Hints Display - Shows all hints, revealed or locked */}
          <View style={styles.hintsContainer}>
            {hints.map((hint: string, index: number) => {
              const isRevealed = index <= currentHintIndex;
              const isCurrent = index === currentHintIndex;
              
              return (
                <View key={index} style={[
                  styles.hintCard,
                  hasImage && styles.hintCardImmersive,
                  isCurrent && styles.hintCardCurrent,
                  !isRevealed && styles.hintCardLocked
                ]}>
                  <View style={[
                    styles.hintNumberBadge,
                    !isRevealed && styles.hintNumberBadgeLocked
                  ]}>
                    <Text style={[
                      styles.hintNumberText,
                      !isRevealed && styles.hintNumberTextLocked
                    ]}>{index + 1}</Text>
                  </View>
                  {isRevealed ? (
                    <>
                      <Text style={[styles.hintText, hasImage && styles.hintTextImmersive]}>
                        {hint}
                      </Text>
                      {/* Show wrong guess for this hint if exists */}
                      {wrongGuesses[index] && (
                        <Text style={styles.wrongGuessText}>
                          ✗ {wrongGuesses[index]}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={styles.hintLockedText}>Hint {index + 1}</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Result Display */}
          {guessResult?.correct && (
            <View style={styles.guessSuccessCard}>
              <Ionicons name="checkmark-circle" size={32} color="#00FF87" />
              <Text style={styles.guessSuccessText}>{guessResult.feedback_message}</Text>
            </View>
          )}
          
          {showCorrectAnswer && !guessResult?.correct && (
            <View style={styles.guessFailCard}>
              <Text style={styles.guessFailLabel}>The answer was:</Text>
              <Text style={styles.guessFailAnswer}>{playable.correct_answer}</Text>
            </View>
          )}
        </View>

        {/* Bottom Section - Input, Submit, Swipe Hint */}
        <View style={[styles.guessBottomSection, hasImage && styles.guessBottomSectionImmersive]}>
          {/* Input and Submit - Only show if not finished */}
          {!guessResult?.correct && !showCorrectAnswer && (
            <>
              <View style={[styles.guessInputWrapper, hasImage && styles.guessInputWrapperImmersive]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.guessInput, hasImage && styles.guessInputImmersive]}
                  placeholder="Type your guess..."
                  placeholderTextColor={hasImage ? "rgba(255,255,255,0.5)" : "#666"}
                  value={userAnswer}
                  onChangeText={setUserAnswer}
                  autoCapitalize="words"
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onFocus={() => {
                    // Scroll to end when input is focused to ensure visibility
                    setTimeout(() => {
                      scrollViewRef.current?.scrollToEnd({ animated: true });
                    }, 300);
                  }}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.guessSubmitButton,
                  (!userAnswer.trim() || submitting || hasSubmitted) && styles.guessSubmitButtonDisabled
                ]}
                onPress={handleGuessSubmit}
                disabled={!userAnswer.trim() || submitting || hasSubmitted}
              >
                <LinearGradient
                  colors={userAnswer.trim() && !submitting && !hasSubmitted ? ['#00FF87', '#00D9FF'] : ['#444', '#555']}
                  style={styles.guessSubmitGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.guessSubmitText}>
                    {hasSubmitted ? 'Checking...' : 'Guess'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}

          {/* Swipe hint */}
          <View style={styles.guessSwipeHint}>
            <Ionicons name="chevron-up" size={20} color={hasImage ? "rgba(255,255,255,0.5)" : "#444"} />
            <Text style={[styles.guessSwipeText, hasImage && styles.guessSwipeTextImmersive]}>
              Swipe up to skip
            </Text>
          </View>
        </View>
      </View>
    );
    
    // Immersive version with background image
    if (hasImage) {
      return (
        <KeyboardAvoidingView 
          style={styles.immersiveContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
        >
          <View style={styles.fullScreenMedia}>
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFillObject}
              resizeMode="cover"
            />
            <View style={styles.guessOverlay}>
              <ScrollView 
                ref={scrollViewRef}
                style={styles.guessScrollView}
                contentContainerStyle={styles.guessScrollContent}
                showsVerticalScrollIndicator={false}
                bounces={true}
                keyboardShouldPersistTaps="handled"
              >
                {renderGuessContent()}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      );
    }
    
    // Standard version without background
    return (
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.guessScrollContentStandard}
          showsVerticalScrollIndicator={false}
          bounces={true}
          keyboardShouldPersistTaps="handled"
        >
          {renderGuessContent()}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
          ) : isYouTubeUrl(mediaSource.uri) && Platform.OS === 'web' ? (
            // Web: Use YouTube iframe for better compatibility
            <View style={[StyleSheet.absoluteFillObject, styles.videoContainer]}>
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeVideoId(mediaSource.uri)}?autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&start=${playable.video_start || 0}${playable.video_end ? `&end=${playable.video_end}` : ''}&enablejsapi=1`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                }}
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
              {/* Transparent overlay to detect when video might be done (approximate) */}
              {playable.video_end && !videoFinished && (
                <TimerOverlay 
                  duration={(playable.video_end - (playable.video_start || 0)) * 1000}
                  onComplete={() => setVideoFinished(true)}
                />
              )}
            </View>
          ) : isYouTubeUrl(mediaSource.uri) ? (
            // Native: Use YouTube Player library
            <View style={[StyleSheet.absoluteFillObject, styles.videoContainer]}>
              <YoutubePlayer
                height={SCREEN_HEIGHT}
                width={SCREEN_WIDTH}
                videoId={getYouTubeVideoId(mediaSource.uri) || ''}
                play={!videoFinished}
                initialPlayerParams={{
                  controls: false,
                  modestbranding: true,
                  showClosedCaptions: false,
                  rel: false,
                  start: playable.video_start || 0,
                  end: playable.video_end || undefined,
                }}
                onChangeState={(state: string) => {
                  if (state === 'ended') {
                    setVideoFinished(true);
                  }
                }}
                webViewStyle={{
                  opacity: 0.99, // Fix for Android rendering
                }}
              />
            </View>
          ) : Platform.OS === 'web' ? (
            // Web: Use native HTML5 video for regular videos
            <View style={[StyleSheet.absoluteFillObject, styles.videoContainer]}>
              <video
                src={mediaSource.uri}
                autoPlay
                muted
                playsInline
                onEnded={() => setVideoFinished(true)}
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
            // Native: Use expo-av Video - no looping, detect when finished
            <Video
              ref={videoRef}
              source={{ uri: mediaSource.uri }}
              style={StyleSheet.absoluteFillObject}
              useNativeControls={false}
              resizeMode={ResizeMode.COVER}
              shouldPlay={true}
              isLooping={false}
              isMuted={false}
              volume={1.0}
              onPlaybackStatusUpdate={handleVideoPlaybackStatus}
            />
          )}
          
          {/* Overlay Content - Show based on video state */}
          {isVideoType ? renderVideoOverlay() : renderImmersiveOverlay()}
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
        {/* Top Row - Category Badge & Progress */}
        <View style={styles.standardTopRow}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{playable.category}</Text>
          </View>
          {/* Progress Badge - Black with white text */}
          {totalCount > 0 && (
            <View style={styles.standardProgressBadge}>
              <Text style={styles.standardProgressText}>
                {currentIndex + 1} / {totalCount}
              </Text>
            </View>
          )}
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
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{playable.category}</Text>
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

  // ============ VIDEO OVERLAY - Watch first, then answer ============
  function renderVideoOverlay() {
    // Before video finishes: Show only minimal info (category, progress)
    if (!videoFinished) {
      return (
        <View style={styles.immersiveOverlay}>
          {/* Top Section - Category & Progress */}
          <View style={styles.topSection}>
            <View style={styles.topRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{playable.category}</Text>
              </View>
              {totalCount > 0 && (
                <View style={styles.progressBadge}>
                  <Text style={styles.progressBadgeText}>
                    {currentIndex + 1} / {totalCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.immersiveTitle}>{playable.title}</Text>
          </View>

          {/* Bottom - Just swipe hint, no watching indicator */}
          <View style={styles.videoWatchingContainer}>
            <View style={styles.swipeHintOverlay}>
              <Ionicons name="chevron-up" size={20} color="rgba(255,255,255,0.5)" />
              <Text style={styles.swipeHintOverlayText}>Swipe up to skip</Text>
            </View>
          </View>
        </View>
      );
    }

    // After video finishes: Show question, options, and centered replay icon
    return (
      <View style={styles.immersiveOverlay}>
        {/* Top Section */}
        <View style={styles.topSection}>
          <View style={styles.topRow}>
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{playable.category}</Text>
            </View>
            {totalCount > 0 && (
              <View style={styles.progressBadge}>
                <Text style={styles.progressBadgeText}>
                  {currentIndex + 1} / {totalCount}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.immersiveTitle}>{playable.title}</Text>
        </View>

        {/* Centered Replay Icon Button */}
        <TouchableOpacity 
          style={styles.replayButtonCentered}
          onPress={handleReplay}
          activeOpacity={0.7}
        >
          <Ionicons name="play" size={32} color="#FFFFFF" />
        </TouchableOpacity>

        {/* Bottom Half - Question & Options appear after video ends */}
        <View style={styles.bottomHalf}>
          {/* Question Card */}
          {playable.question.text && (
            <View style={styles.questionCardVideo}>
              <Text style={styles.immersiveQuestion}>{playable.question.text}</Text>
            </View>
          )}

          {/* MCQ Options - Higher opacity */}
          {playable.answer_type === 'mcq' && playable.options && (
            <View style={styles.immersiveOptionsGrid}>
              {playable.options.map((option: string, index: number) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.glassOptionVideo,
                    selectedOption === option && styles.glassOptionSelectedVideo,
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

          {/* Text Input - Higher opacity */}
          {playable.answer_type === 'text_input' && (
            <View style={styles.immersiveInputContainer}>
              <View style={styles.glassInputWrapperVideo}>
                <TextInput
                  style={styles.immersiveTextInput}
                  placeholder="Type your answer..."
                  placeholderTextColor="rgba(255,255,255,0.6)"
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

          {/* Swipe hint */}
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
  standardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  standardProgressBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  standardProgressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
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
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  progressBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  immersiveTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
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
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'left',
    lineHeight: 24,
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
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
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    fontWeight: '700',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
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
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },

  // ============ GUESS THE X STYLES ============
  guessContentWrapper: {
    flex: 1,
    justifyContent: 'space-between',
  },
  guessTopSection: {
    flex: 1,
  },
  guessTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  guessTopRowImmersive: {
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingHorizontal: 16,
  },
  guessCounters: {
    flexDirection: 'row',
    gap: 8,
  },
  guessTitleImmersive: {
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  hintsContainer: {
    marginTop: 16,
    marginBottom: 24,
    gap: 10,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  hintCardImmersive: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    marginHorizontal: 16,
  },
  hintCardCurrent: {
    borderColor: '#00FF87',
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
  },
  hintCardLocked: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderColor: 'rgba(255,255,255,0.05)',
    borderStyle: 'dashed',
  },
  hintNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00FF87',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hintNumberBadgeLocked: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  hintNumberText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  hintNumberTextLocked: {
    color: 'rgba(255,255,255,0.3)',
  },
  hintText: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 22,
  },
  hintTextImmersive: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  wrongGuessText: {
    fontSize: 13,
    color: '#FF6B6B',
    fontWeight: '500',
    marginTop: 6,
    paddingLeft: 4,
  },
  hintLockedText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    fontStyle: 'italic',
  },
  guessSuccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 135, 0.3)',
  },
  guessSuccessText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#00FF87',
  },
  guessFailCard: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 107, 107, 0.3)',
    alignItems: 'center',
  },
  guessFailLabel: {
    fontSize: 14,
    color: '#FF6B6B',
    marginBottom: 4,
  },
  guessFailAnswer: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guessBottomSection: {
    paddingTop: 16,
    gap: 12,
  },
  guessBottomSectionImmersive: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  guessInputWrapper: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  guessInputWrapperImmersive: {
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  guessInput: {
    padding: 14,
    fontSize: 16,
    color: '#FFFFFF',
  },
  guessInputImmersive: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  guessSubmitButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  guessSubmitButtonDisabled: {
    opacity: 0.6,
  },
  guessSubmitGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  guessSubmitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  guessSwipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  guessSwipeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  guessSwipeTextImmersive: {
    color: 'rgba(255,255,255,0.6)',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  guessOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
  },
  guessScrollView: {
    flex: 1,
  },
  guessScrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  guessScrollContentStandard: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 20,
  },

  // ============ VIDEO WATCH-THEN-ANSWER STYLES ============
  videoWatchingContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
  },
  watchingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 10,
    marginBottom: 16,
  },
  watchingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  replayButtonCentered: {
    position: 'absolute',
    top: '45%',
    left: '50%',
    marginLeft: -30,
    marginTop: -30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    zIndex: 20,
  },
  // Higher opacity styles for video question options
  questionCardVideo: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  glassOptionVideo: {
    width: '48%',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  glassOptionSelectedVideo: {
    borderColor: '#00FF87',
    backgroundColor: 'rgba(0,255,135,0.25)',
  },
  glassInputWrapperVideo: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
