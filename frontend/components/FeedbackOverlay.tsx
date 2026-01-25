import React, { useEffect, useRef, useMemo } from 'react';
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

// Identity titles by category
const CATEGORY_IDENTITIES: Record<string, { title: string; emoji: string }> = {
  'Football': { title: 'Football Expert', emoji: '🏈' },
  'Sports': { title: 'Sports Guru', emoji: '🏆' },
  'History': { title: 'History Buff', emoji: '📚' },
  'Science': { title: 'Science Whiz', emoji: '🔬' },
  'Geography': { title: 'World Explorer', emoji: '🌍' },
  'Maths': { title: 'Math Genius', emoji: '🧮' },
  'Chess': { title: 'Chess Master', emoji: '♟️' },
  'Entertainment': { title: 'Pop Culture Pro', emoji: '🎬' },
  'Music': { title: 'Music Maestro', emoji: '🎵' },
  'Art': { title: 'Art Connoisseur', emoji: '🎨' },
  'Literature': { title: 'Literary Genius', emoji: '📖' },
  'Technology': { title: 'Tech Wizard', emoji: '💻' },
  'default': { title: 'Trivia Champion', emoji: '🏅' },
};

// Streak celebration messages
const getStreakMessage = (streak: number): { text: string; emoji: string } | null => {
  if (streak >= 10) return { text: "LEGENDARY! Top 1% of players!", emoji: "👑" };
  if (streak >= 7) return { text: "Incredible! Top 5% territory!", emoji: "🌟" };
  if (streak >= 5) return { text: "Unstoppable! Only top 10% reach this!", emoji: "🔥" };
  if (streak >= 3) return { text: "Hat-trick! You're on fire!", emoji: "🎩" };
  if (streak === 2) return { text: "Double up! Keep it rolling!", emoji: "✨" };
  return null;
};

// Social proof messages (faked percentages)
const SOCIAL_PROOF_CORRECT = [
  { text: "Only 34% got this right", suffix: "you're sharp!" },
  { text: "Faster than 78% of players", suffix: "lightning fast!" },
  { text: "This stumped most people", suffix: "not you though!" },
  { text: "Top 25% answer", suffix: "impressive!" },
  { text: "Beat the average by 2x", suffix: "well done!" },
  { text: "67% got this wrong", suffix: "you nailed it!" },
];

// Identity validation messages
const getIdentityMessage = (category: string, count: number): { text: string; emoji: string } | null => {
  if (count < 2) return null;
  const identity = CATEGORY_IDENTITIES[category] || CATEGORY_IDENTITIES['default'];
  if (count >= 5) return { text: `${identity.title}!`, emoji: identity.emoji };
  if (count >= 3) return { text: `Rising ${identity.title}!`, emoji: identity.emoji };
  if (count >= 2) return { text: `${category} streak building!`, emoji: "📈" };
  return null;
};

// Incorrect answer encouragement
const ENCOURAGEMENT_MESSAGES = [
  { text: "Now you know!", suffix: "Knowledge +1 📈" },
  { text: "The greats learn from every miss", suffix: "keep going!" },
  { text: "New neural pathway formed", suffix: "brain upgraded! 🧠" },
  { text: "Every expert was once a beginner", suffix: "you're learning!" },
  { text: "That's how knowledge grows", suffix: "onto the next! 💪" },
];

// Streak loss softening
const STREAK_LOSS_MESSAGES = [
  { text: "Fresh start loading...", suffix: "Let's go!" },
  { text: "Streak reset", suffix: "but champions bounce back!" },
  { text: "New streak opportunity", suffix: "this could be the big one!" },
  { text: "Clean slate", suffix: "time to build something great!" },
];

export default function FeedbackOverlay({
  visible,
  correct,
  correctAnswer,
  answerExplanation,
  currentStreak = 0,
  previousStreak = 0,
  hintsUsed,
  category = '',
  categoryCorrectCount = 0,
}: FeedbackOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  // Generate two psychological messages
  const messages = useMemo(() => {
    const result: { text: string; highlight?: boolean; emoji?: string }[] = [];
    
    if (correct) {
      // Message 1: Streak or Identity based
      const streakMsg = getStreakMessage(currentStreak);
      const identityMsg = getIdentityMessage(category, categoryCorrectCount);
      
      if (streakMsg && currentStreak > 1) {
        result.push({ text: streakMsg.text, emoji: streakMsg.emoji, highlight: true });
      } else if (identityMsg) {
        result.push({ text: identityMsg.text, emoji: identityMsg.emoji, highlight: true });
      } else if (currentStreak === 1) {
        result.push({ text: "New streak started!", emoji: "🔥", highlight: true });
      }
      
      // Message 2: Social proof
      const socialProof = SOCIAL_PROOF_CORRECT[Math.floor(Math.random() * SOCIAL_PROOF_CORRECT.length)];
      result.push({ text: `${socialProof.text} — ${socialProof.suffix}` });
      
    } else {
      // Wrong answer messages
      const hadStreak = previousStreak > 0;
      
      // Message 1: Streak loss or encouragement
      if (hadStreak && previousStreak >= 3) {
        const lossMsg = STREAK_LOSS_MESSAGES[Math.floor(Math.random() * STREAK_LOSS_MESSAGES.length)];
        result.push({ text: `${lossMsg.text} ${lossMsg.suffix}`, highlight: true });
      } else {
        const encourageMsg = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
        result.push({ text: `${encourageMsg.text} ${encourageMsg.suffix}`, highlight: true });
      }
      
      // Message 2: Recovery motivation
      if (!hadStreak || previousStreak < 3) {
        const recoveryMessages = [
          "Your next streak starts now!",
          "The comeback is always greater!",
          "One question at a time!",
        ];
        result.push({ text: recoveryMessages[Math.floor(Math.random() * recoveryMessages.length)] });
      }
    }
    
    return result;
  }, [correct, currentStreak, previousStreak, category, categoryCorrectCount]);

  useEffect(() => {
    if (visible) {
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

          {/* Psychological Messages */}
          <View style={styles.messagesContainer}>
            {messages.map((msg, index) => (
              <View key={index} style={[
                styles.messageRow,
                msg.highlight && styles.messageRowHighlight
              ]}>
                {msg.emoji && <Text style={styles.messageEmoji}>{msg.emoji}</Text>}
                <Text style={[
                  styles.messageText,
                  msg.highlight && styles.messageTextHighlight
                ]}>
                  {msg.text}
                </Text>
              </View>
            ))}
          </View>

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
          <View style={[
            styles.streakContainer,
            currentStreak >= 5 && styles.streakContainerHot
          ]}>
            <Ionicons 
              name="flame" 
              size={18} 
              color={currentStreak >= 5 ? "#FFD700" : "#FF6B00"} 
            />
            <Text style={[
              styles.streakText,
              currentStreak >= 5 && styles.streakTextHot
            ]}>
              {currentStreak} streak
            </Text>
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
    padding: 28,
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
    marginBottom: 12,
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
    marginBottom: 8,
  },
  messagesContainer: {
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
  },
  messageRowHighlight: {
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
  },
  messageEmoji: {
    fontSize: 18,
  },
  messageText: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
  },
  messageTextHighlight: {
    color: '#FFD700',
    fontWeight: '600',
    fontSize: 15,
  },
  answerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
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
    marginBottom: 12,
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
    marginBottom: 12,
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
    marginBottom: 16,
  },
  streakContainerHot: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  streakText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FF6B00',
  },
  streakTextHot: {
    color: '#FFD700',
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
