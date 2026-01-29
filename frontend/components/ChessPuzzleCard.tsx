import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
} from 'react-native';
import { Chess, Square, Move } from 'chess.js';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BOARD_SIZE = Math.min(SCREEN_WIDTH - 40, 360);
const SQUARE_SIZE = BOARD_SIZE / 8;

// Chess piece characters - using FILLED symbols (♚♛♜♝♞♟) for BOTH colors
// DO NOT CHANGE - This exact configuration produces consistent pieces across devices:
// - Both white and black pieces use the SAME filled Unicode symbols
// - Colors are applied via styling (white: #FFFFFF, black: #1A1A1A)
// - White pieces have black shadow for visibility on light squares
// - Black pieces have minimal shadow
const PIECES: { [key: string]: string } = {
  'wk': '♚', 'wq': '♛', 'wr': '♜', 'wb': '♝', 'wn': '♞', 'wp': '♟',
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': '♟',
};

// Helper to get piece character
const getPieceChar = (piece: { type: string; color: string }): string => {
  const key = `${piece.color}${piece.type}`;
  return PIECES[key] || '';
};

interface ChessPuzzleCardProps {
  playable: {
    playable_id: string;
    title: string;
    category: string;
    fen: string;
    solution: string[];
    difficulty?: string;
  };
  onPuzzleSolved: (hintsUsed: number) => void;
  onPuzzleFailed: () => void;
  currentIndex?: number;
  totalCount?: number;
}

type PuzzleState = 'PLAYING' | 'OPPONENT_MOVING' | 'SOLVED' | 'FAILED';

export default function ChessPuzzleCard({
  playable,
  onPuzzleSolved,
  onPuzzleFailed,
  currentIndex = 0,
  totalCount = 0,
}: ChessPuzzleCardProps) {
  const [chess] = useState(() => new Chess(playable.fen));
  const [board, setBoard] = useState(chess.board());
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);
  const [moveIndex, setMoveIndex] = useState(0);
  const [puzzleState, setPuzzleState] = useState<PuzzleState>('PLAYING');
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState<string>('Your turn - Find the winning move!');

  // Reset when playable changes
  useEffect(() => {
    chess.load(playable.fen);
    setBoard(chess.board());
    setSelectedSquare(null);
    setLegalMoves([]);
    setMoveIndex(0);
    setPuzzleState('PLAYING');
    setLastMove(null);
    setMessage('Your turn - Find the winning move!');
  }, [playable.playable_id]);

  const getSquareName = (row: number, col: number): Square => {
    const file = String.fromCharCode(97 + col); // a-h
    const rank = 8 - row; // 8-1
    return `${file}${rank}` as Square;
  };

  const handleSquareTap = (row: number, col: number) => {
    if (puzzleState !== 'PLAYING') return;

    const square = getSquareName(row, col);
    const piece = chess.get(square);

    // If a square is already selected
    if (selectedSquare) {
      // Check if tapping on a legal move destination
      if (legalMoves.includes(square)) {
        makeMove(selectedSquare, square);
      } else if (piece && piece.color === chess.turn()) {
        // Select a different piece of same color
        selectSquare(square);
      } else {
        // Deselect
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    } else {
      // No square selected - try to select this one
      if (piece && piece.color === chess.turn()) {
        selectSquare(square);
      }
    }
  };

  const selectSquare = (square: Square) => {
    setSelectedSquare(square);
    const moves = chess.moves({ square, verbose: true });
    setLegalMoves(moves.map(m => m.to as Square));
  };

  const makeMove = (from: Square, to: Square) => {
    // Solution contains ALL moves in UCI format: [playerMove1, opponentMove1, playerMove2, ...]
    // For mate-in-1: solution has 1 move (player's checkmate)
    // For mate-in-2: solution has 3 moves (player, opponent, player checkmate)
    
    // Convert from-to to UCI format
    const userMoveUCI = `${from}${to}`;
    
    // Get the expected player move (even indices: 0, 2, 4...)
    const expectedMoveUCI = playable.solution[moveIndex];
    
    // Try to make the move
    const move = chess.move({ from, to, promotion: 'q' });
    
    if (!move) {
      // Invalid move
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Check if this matches the expected solution (UCI comparison)
    // Handle promotion: e7e8 should match e7e8q
    const normalizeUCI = (m: string) => m.toLowerCase().substring(0, 4);
    const isCorrectMove = normalizeUCI(userMoveUCI) === normalizeUCI(expectedMoveUCI);

    console.log(`Move made: ${userMoveUCI}, Expected: ${expectedMoveUCI}, Match: ${isCorrectMove}`);

    if (!isCorrectMove) {
      // Wrong move - undo and show failure
      chess.undo();
      setBoard(chess.board());
      setSelectedSquare(null);
      setLegalMoves([]);
      setMessage('Wrong move! Try again.');
      
      // Give them another chance
      setTimeout(() => {
        setMessage('Your turn - Find the winning move!');
      }, 1500);
      return;
    }

    // Correct move!
    setBoard(chess.board());
    setLastMove({ from, to });
    setSelectedSquare(null);
    setLegalMoves([]);

    // Check if puzzle is solved (checkmate or no more moves)
    if (chess.isCheckmate()) {
      setPuzzleState('SOLVED');
      setMessage('Checkmate! Puzzle solved!');
      setTimeout(() => {
        onPuzzleSolved(Math.floor(moveIndex / 2) + 1);
      }, 1000);
      return;
    }

    // Check if there's an opponent response in the solution
    const opponentMoveIndex = moveIndex + 1;
    if (opponentMoveIndex < playable.solution.length) {
      // Opponent needs to respond
      setPuzzleState('OPPONENT_MOVING');
      setMessage('Opponent is thinking...');

      setTimeout(() => {
        makeOpponentMove(opponentMoveIndex);
      }, 800);
    } else {
      // No more moves but not checkmate - puzzle might be incorrectly set up
      setPuzzleState('SOLVED');
      setMessage('Puzzle complete!');
      setTimeout(() => {
        onPuzzleSolved(Math.floor(moveIndex / 2) + 1);
      }, 1000);
    }
  };

  const makeOpponentMove = (opponentMoveIdx: number) => {
    // Get the hardcoded opponent move from solution (UCI format)
    const opponentMoveUCI = playable.solution[opponentMoveIdx];
    
    if (!opponentMoveUCI || opponentMoveUCI.length < 4) {
      console.error('Invalid opponent move in solution:', opponentMoveUCI);
      return;
    }

    // Parse UCI move
    const from = opponentMoveUCI.substring(0, 2) as Square;
    const to = opponentMoveUCI.substring(2, 4) as Square;
    const promotion = opponentMoveUCI.length > 4 ? opponentMoveUCI[4] : undefined;

    // Make the opponent's move
    const move = chess.move({ from, to, promotion: promotion as any });
    
    if (!move) {
      console.error('Failed to make opponent move:', opponentMoveUCI);
      return;
    }
    
    setBoard(chess.board());
    setLastMove({ from, to });
    
    // Update move index to next player move
    setMoveIndex(opponentMoveIdx + 1);
    
    // Player's turn again
    setPuzzleState('PLAYING');
    setMessage('Your turn - Finish the checkmate!');
  };

  const renderSquare = (row: number, col: number) => {
    const isLight = (row + col) % 2 === 0;
    const square = getSquareName(row, col);
    const piece = board[row][col];
    const isSelected = selectedSquare === square;
    const isLegalMove = legalMoves.includes(square);
    const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);

    return (
      <TouchableOpacity
        key={`${row}-${col}`}
        style={[
          styles.square,
          { backgroundColor: isLight ? '#F0D9B5' : '#B58863' },
          isSelected && styles.selectedSquare,
          isLastMoveSquare && styles.lastMoveSquare,
        ]}
        onPress={() => handleSquareTap(row, col)}
        activeOpacity={0.8}
      >
        {/* Legal move indicator */}
        {isLegalMove && !piece && (
          <View style={styles.legalMoveIndicator} />
        )}
        {isLegalMove && piece && (
          <View style={styles.captureIndicator} />
        )}
        
        {/* Piece */}
        {piece && (
          <Text style={[
            styles.piece,
            piece.color === 'w' ? styles.whitePiece : styles.blackPiece
          ]}>
            {getPieceChar(piece)}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderBoard = () => {
    const rows = [];
    for (let row = 0; row < 8; row++) {
      const squares = [];
      for (let col = 0; col < 8; col++) {
        squares.push(renderSquare(row, col));
      }
      rows.push(
        <View key={row} style={styles.row}>
          {squares}
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={styles.container}>
      {/* Top Row - Category & Progress */}
      <View style={styles.topRow}>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{playable.category}</Text>
        </View>
        {totalCount > 0 && (
          <View style={styles.progressBadge}>
            <Text style={styles.progressText}>
              {currentIndex + 1} / {totalCount}
            </Text>
          </View>
        )}
      </View>

      {/* Title */}
      <Text style={styles.title}>{playable.title}</Text>

      {/* Status Message */}
      <View style={[
        styles.messageContainer,
        puzzleState === 'SOLVED' && styles.messageSuccess,
        puzzleState === 'FAILED' && styles.messageFailed,
      ]}>
        <Ionicons 
          name={puzzleState === 'SOLVED' ? 'checkmark-circle' : puzzleState === 'FAILED' ? 'close-circle' : 'information-circle'} 
          size={18} 
          color={puzzleState === 'SOLVED' ? '#00FF87' : puzzleState === 'FAILED' ? '#FF6B6B' : '#00D9FF'} 
        />
        <Text style={[
          styles.messageText,
          puzzleState === 'SOLVED' && styles.messageTextSuccess,
          puzzleState === 'FAILED' && styles.messageTextFailed,
        ]}>{message}</Text>
      </View>

      {/* Chess Board with labels */}
      <View style={styles.boardWrapper}>
        {/* Rank labels (8-1) on the left */}
        <View style={styles.rankLabels}>
          {[8, 7, 6, 5, 4, 3, 2, 1].map(rank => (
            <Text key={rank} style={styles.rankLabel}>{rank}</Text>
          ))}
        </View>
        
        <View style={styles.boardContainer}>
          <View style={styles.board}>
            {renderBoard()}
          </View>
          
          {/* File labels (a-h) at bottom */}
          <View style={styles.fileLabels}>
            {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(file => (
              <Text key={file} style={styles.fileLabel}>{file}</Text>
            ))}
          </View>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructionsContainer}>
        <Ionicons name="finger-print" size={16} color="#888" />
        <Text style={styles.instructionsText}>
          Tap a piece to select, then tap destination
        </Text>
      </View>

      {/* Swipe hint */}
      <View style={styles.swipeHint}>
        <Ionicons name="chevron-up" size={20} color="#444" />
        <Text style={styles.swipeHintText}>Swipe up to skip</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    borderRadius: 16,
    overflow: 'hidden',
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
  progressBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  messageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginBottom: 16,
    gap: 8,
  },
  messageSuccess: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
  },
  messageFailed: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
  },
  messageText: {
    fontSize: 14,
    color: '#00D9FF',
    fontWeight: '600',
    flex: 1,
  },
  messageTextSuccess: {
    color: '#00FF87',
  },
  messageTextFailed: {
    color: '#FF6B6B',
  },
  boardWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginBottom: 12,
  },
  boardContainer: {
    alignItems: 'center',
  },
  board: {
    width: BOARD_SIZE,
    height: BOARD_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#2A2A3E',
  },
  row: {
    flexDirection: 'row',
  },
  square: {
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedSquare: {
    backgroundColor: '#7B61FF',
    opacity: 0.9,
  },
  lastMoveSquare: {
    backgroundColor: '#CDD26A',
  },
  piece: {
    fontSize: SQUARE_SIZE * 0.75,
    lineHeight: SQUARE_SIZE,
    textAlign: 'center',
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    includeFontPadding: false,  // Android: removes extra padding
    textAlignVertical: 'center',
  },
  whitePiece: {
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  blackPiece: {
    color: '#1A1A1A',
    textShadowColor: 'rgba(255, 255, 255, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  legalMoveIndicator: {
    width: SQUARE_SIZE * 0.3,
    height: SQUARE_SIZE * 0.3,
    borderRadius: SQUARE_SIZE * 0.15,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  captureIndicator: {
    position: 'absolute',
    width: SQUARE_SIZE,
    height: SQUARE_SIZE,
    borderRadius: SQUARE_SIZE / 2,
    borderWidth: 4,
    borderColor: 'rgba(0, 0, 0, 0.2)',
  },
  fileLabels: {
    flexDirection: 'row',
    width: BOARD_SIZE,
    marginTop: 4,
  },
  fileLabel: {
    width: SQUARE_SIZE,
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    textAlign: 'center',
  },
  rankLabels: {
    justifyContent: 'space-around',
    height: BOARD_SIZE,
    marginRight: 6,
    paddingVertical: 2,
  },
  rankLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    textAlign: 'center',
    height: SQUARE_SIZE,
    lineHeight: SQUARE_SIZE,
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 16,
  },
  instructionsText: {
    fontSize: 13,
    color: '#888',
  },
  swipeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  swipeHintText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
});
