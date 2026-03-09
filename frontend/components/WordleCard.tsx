import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Lazy load the word dictionary to avoid memory issues on app startup
let VALID_WORDS: Set<string> | null = null;
const getValidWords = (): Set<string> => {
  if (!VALID_WORDS) {
    const { VALID_WORDS: words } = require('../data/wordleWords');
    VALID_WORDS = words;
  }
  return VALID_WORDS as Set<string>;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WORD_LENGTH = 5;
const MAX_ATTEMPTS = 6;

// Tile size calculation
const GRID_PADDING = 20;
const TILE_GAP = 6;
const TILE_SIZE = Math.min(
  (SCREEN_WIDTH - GRID_PADDING * 2 - TILE_GAP * (WORD_LENGTH - 1)) / WORD_LENGTH,
  62
);

// Keyboard layout
const KEYBOARD_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DEL'],
];

type TileState = 'empty' | 'filled' | 'correct' | 'present' | 'absent';
type KeyState = 'unused' | 'correct' | 'present' | 'absent';

interface WordleCardProps {
  targetWord: string;
  hint?: string;
  onComplete: (won: boolean, attempts: number) => void;
  disabled?: boolean;
}

export default function WordleCard({
  targetWord,
  hint,
  onComplete,
  disabled = false,
}: WordleCardProps) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [currentRow, setCurrentRow] = useState(0);
  const [keyStates, setKeyStates] = useState<Record<string, KeyState>>({});
  const [tileStates, setTileStates] = useState<TileState[][]>(
    Array(MAX_ATTEMPTS).fill(null).map(() => Array(WORD_LENGTH).fill('empty'))
  );
  const [shakeRow, setShakeRow] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  
  // Shake animation
  const shakeAnim = useState(new Animated.Value(0))[0];

  const target = targetWord.toUpperCase();

  // Validate word against dictionary
  const isValidWord = useCallback((word: string): boolean => {
    const validWords = getValidWords();
    return validWords.has(word.toUpperCase());
  }, []);

  // Get tile state for a letter
  const getTileState = useCallback((guess: string, index: number): TileState => {
    const letter = guess[index].toUpperCase();
    const targetLetter = target[index];
    
    if (letter === targetLetter) {
      return 'correct';
    }
    
    // Check if letter exists elsewhere in target
    // But account for letters already matched
    const targetLetterCounts: Record<string, number> = {};
    for (const l of target) {
      targetLetterCounts[l] = (targetLetterCounts[l] || 0) + 1;
    }
    
    // First pass: remove exact matches
    for (let i = 0; i < WORD_LENGTH; i++) {
      if (guess[i].toUpperCase() === target[i]) {
        targetLetterCounts[target[i]]--;
      }
    }
    
    // Check if this letter is present (yellow)
    if (targetLetterCounts[letter] > 0) {
      // Count how many of this letter before current index are not exact matches
      let countBefore = 0;
      for (let i = 0; i < index; i++) {
        if (guess[i].toUpperCase() === letter && guess[i].toUpperCase() !== target[i]) {
          countBefore++;
        }
      }
      if (countBefore < targetLetterCounts[letter]) {
        return 'present';
      }
    }
    
    return 'absent';
  }, [target]);

  // Shake animation for invalid word
  const triggerShake = useCallback(() => {
    setShakeRow(currentRow);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start(() => setShakeRow(null));
  }, [currentRow, shakeAnim]);

  // Handle key press
  const handleKeyPress = useCallback((key: string) => {
    if (disabled || gameOver) return;

    if (key === 'DEL') {
      setCurrentGuess(prev => prev.slice(0, -1));
      // Update tile state
      setTileStates(prev => {
        const newStates = [...prev];
        newStates[currentRow] = [...newStates[currentRow]];
        newStates[currentRow][currentGuess.length - 1] = 'empty';
        return newStates;
      });
      return;
    }

    if (key === 'ENTER') {
      if (currentGuess.length !== WORD_LENGTH) {
        setMessage('Not enough letters');
        triggerShake();
        setTimeout(() => setMessage(null), 1500);
        return;
      }

      if (!isValidWord(currentGuess)) {
        setMessage('Not in word list');
        triggerShake();
        setTimeout(() => setMessage(null), 1500);
        return;
      }

      // Valid guess - reveal tiles
      const newTileStates = [...tileStates];
      newTileStates[currentRow] = currentGuess.split('').map((_, i) => getTileState(currentGuess, i));
      setTileStates(newTileStates);

      // Update key states
      const newKeyStates = { ...keyStates };
      for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = currentGuess[i].toUpperCase();
        const state = newTileStates[currentRow][i];
        
        // Only upgrade key state (correct > present > absent)
        if (state === 'correct') {
          newKeyStates[letter] = 'correct';
        } else if (state === 'present' && newKeyStates[letter] !== 'correct') {
          newKeyStates[letter] = 'present';
        } else if (state === 'absent' && !newKeyStates[letter]) {
          newKeyStates[letter] = 'absent';
        }
      }
      setKeyStates(newKeyStates);

      // Check win/lose
      const won = currentGuess.toUpperCase() === target;
      const lost = currentRow === MAX_ATTEMPTS - 1 && !won;

      setGuesses(prev => [...prev, currentGuess]);
      
      if (won) {
        setGameOver(true);
        setMessage('Excellent!');
        setTimeout(() => onComplete(true, currentRow + 1), 1000);
      } else if (lost) {
        setGameOver(true);
        setMessage(`The word was ${target}`);
        setTimeout(() => onComplete(false, MAX_ATTEMPTS), 1500);
      } else {
        setCurrentRow(prev => prev + 1);
        setCurrentGuess('');
      }
      return;
    }

    // Regular letter
    if (currentGuess.length < WORD_LENGTH) {
      const newGuess = currentGuess + key.toUpperCase();
      setCurrentGuess(newGuess);
      
      // Update tile state to filled
      setTileStates(prev => {
        const newStates = [...prev];
        newStates[currentRow] = [...newStates[currentRow]];
        newStates[currentRow][currentGuess.length] = 'filled';
        return newStates;
      });
    }
  }, [currentGuess, currentRow, disabled, gameOver, getTileState, isValidWord, keyStates, onComplete, target, tileStates, triggerShake]);

  // Get tile background color
  const getTileColor = (state: TileState): string => {
    switch (state) {
      case 'correct': return '#538d4e';  // Green
      case 'present': return '#b59f3b';  // Yellow
      case 'absent': return '#3a3a3c';   // Dark gray
      case 'filled': return 'transparent';
      default: return 'transparent';
    }
  };

  // Get tile border color
  const getTileBorderColor = (state: TileState): string => {
    switch (state) {
      case 'correct':
      case 'present':
      case 'absent':
        return 'transparent';
      case 'filled':
        return '#565758';
      default:
        return '#3a3a3c';
    }
  };

  // Get key background color
  const getKeyColor = (key: string): string => {
    const state = keyStates[key];
    switch (state) {
      case 'correct': return '#538d4e';
      case 'present': return '#b59f3b';
      case 'absent': return '#3a3a3c';
      default: return '#818384';
    }
  };

  // Render a single tile
  const renderTile = (rowIndex: number, colIndex: number) => {
    const isCurrentRow = rowIndex === currentRow;
    const letter = isCurrentRow 
      ? currentGuess[colIndex] || ''
      : guesses[rowIndex]?.[colIndex] || '';
    const state = tileStates[rowIndex][colIndex];
    
    const animStyle = isCurrentRow && shakeRow === rowIndex
      ? { transform: [{ translateX: shakeAnim }] }
      : {};

    return (
      <Animated.View
        key={`${rowIndex}-${colIndex}`}
        style={[
          styles.tile,
          {
            backgroundColor: getTileColor(state),
            borderColor: getTileBorderColor(state),
            width: TILE_SIZE,
            height: TILE_SIZE,
          },
          animStyle,
        ]}
      >
        <Text style={[
          styles.tileLetter,
          { fontSize: TILE_SIZE * 0.55 }
        ]}>
          {letter.toUpperCase()}
        </Text>
      </Animated.View>
    );
  };

  // Render keyboard key
  const renderKey = (key: string) => {
    const isWide = key === 'ENTER' || key === 'DEL';
    const keyWidth = isWide ? 50 : 32;

    return (
      <TouchableOpacity
        key={key}
        style={[
          styles.key,
          {
            backgroundColor: getKeyColor(key),
            width: keyWidth,
          }
        ]}
        onPress={() => handleKeyPress(key)}
        activeOpacity={0.7}
        disabled={disabled || gameOver}
      >
        <Text style={[styles.keyText, isWide && styles.keyTextSmall]}>
          {key === 'DEL' ? '⌫' : key}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Hint */}
      {hint && (
        <View style={styles.hintContainer}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      {/* Message */}
      {message && (
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{message}</Text>
        </View>
      )}

      {/* Grid */}
      <View style={styles.grid}>
        {Array(MAX_ATTEMPTS).fill(null).map((_, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {Array(WORD_LENGTH).fill(null).map((_, colIndex) => 
              renderTile(rowIndex, colIndex)
            )}
          </View>
        ))}
      </View>

      {/* Keyboard */}
      <View style={styles.keyboard}>
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keyboardRow}>
            {row.map(key => renderKey(key))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
  },
  hintContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  hintText: {
    color: '#888',
    fontSize: 14,
    fontStyle: 'italic',
  },
  messageContainer: {
    position: 'absolute',
    top: 60,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 4,
    zIndex: 100,
  },
  messageText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },
  grid: {
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    gap: TILE_GAP,
    marginBottom: TILE_GAP,
  },
  tile: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 4,
  },
  tileLetter: {
    color: '#fff',
    fontWeight: '700',
  },
  keyboard: {
    width: '100%',
    paddingHorizontal: 8,
    gap: 6,
  },
  keyboardRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  key: {
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
  },
  keyText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  keyTextSmall: {
    fontSize: 11,
  },
});
