import React, { useState, useEffect, useRef, memo } from 'react';
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

// Chess piece Unicode symbols
// Using filled symbols (♚♛♜♝♞♟) for all pieces with CSS color applied
// IMPORTANT: Pawn symbol needs \uFE0E (text variation selector) to prevent 
// iOS from rendering it as an emoji with fixed black color
const TEXT_VS = '\uFE0E'; // Text variation selector - forces text rendering
const PIECES: { [key: string]: string } = {
  'wk': '♚', 'wq': '♛', 'wr': '♜', 'wb': '♝', 'wn': '♞', 'wp': `♟${TEXT_VS}`,
  'bk': '♚', 'bq': '♛', 'br': '♜', 'bb': '♝', 'bn': '♞', 'bp': `♟${TEXT_VS}`,
};

// Helper to get piece character
const getPieceChar = (piece: { type: string; color: string }): string => {
  const key = `${piece.color}${piece.type}`;
  return PIECES[key] || '';
};

interface ChessPuzzleCardProps {
  playable: {
    playable_id: string;
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

function ChessPuzzleCard({
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
  const [moveIndex, setMoveIndex] = useState(0); // Current position in solution array
  const [puzzleState, setPuzzleState] = useState<PuzzleState>('OPPONENT_MOVING'); // Start with opponent moving
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(null);
  const [message, setMessage] = useState<string>('Watch the opponent\'s move...');
  
  // Determine if board should be flipped (player plays as black)
  // In puzzles, the player makes moves at odd indices (1, 3, 5...)
  // The color that moves first (from FEN) is the opponent
  // So the player's color is the opposite of the FEN's active color
  const getPlayerColor = () => {
    const fenParts = playable.fen.split(' ');
    const activeColor = fenParts[1]; // 'w' or 'b'
    // Player is the opposite color (they respond to opponent's first move)
    return activeColor === 'w' ? 'b' : 'w';
  };
  
  const playerColor = getPlayerColor();
  const isFlipped = playerColor === 'b'; // Flip board when player is black

  // Reset when playable changes and auto-play opponent's first move
  useEffect(() => {
    chess.load(playable.fen);
    setBoard(chess.board());
    setSelectedSquare(null);
    setLegalMoves([]);
    setMoveIndex(0);
    setPuzzleState('OPPONENT_MOVING');
    setLastMove(null);
    setMessage('Watch the opponent\'s move...');

    // Auto-play opponent's first move (solution[0]) after a brief delay
    const timer = setTimeout(() => {
      playOpponentMove(0);
    }, 1000);

    return () => clearTimeout(timer);
  }, [playable.playable_id]);

  // Play opponent's move at given index (even indices: 0, 2, 4...)
  const playOpponentMove = (idx: number) => {
    const moveUCI = playable.solution[idx];
    
    if (!moveUCI || moveUCI.length < 4) {
      console.error('Invalid opponent move in solution:', moveUCI);
      return;
    }

    // Parse UCI move
    const from = moveUCI.substring(0, 2) as Square;
    const to = moveUCI.substring(2, 4) as Square;
    const promotion = moveUCI.length > 4 ? moveUCI[4] : undefined;

    // Make the opponent's move
    const move = chess.move({ from, to, promotion: promotion as any });
    
    if (!move) {
      console.error('Failed to make opponent move:', moveUCI);
      return;
    }
    
    setBoard(chess.board());
    setLastMove({ from, to });
    setMoveIndex(idx + 1); // Move to next index (player's turn)
    setPuzzleState('PLAYING');
    setMessage('Your turn - Find the best move!');
  };

  const getSquareName = (row: number, col: number): Square => {
    // When flipped, we need to convert visual coordinates to actual board coordinates
    if (isFlipped) {
      const file = String.fromCharCode(97 + (7 - col)); // h-a (reversed)
      const rank = row + 1; // 1-8 (reversed)
      return `${file}${rank}` as Square;
    } else {
      const file = String.fromCharCode(97 + col); // a-h
      const rank = 8 - row; // 8-1
      return `${file}${rank}` as Square;
    }
  };

  // Get visual row/col for a square (for rendering)
  const getVisualPosition = (square: Square): { row: number; col: number } => {
    const file = square.charCodeAt(0) - 97; // 0-7 (a-h)
    const rank = parseInt(square[1]); // 1-8
    
    if (isFlipped) {
      return {
        row: rank - 1, // 1->0, 8->7
        col: 7 - file, // a->7, h->0
      };
    } else {
      return {
        row: 8 - rank, // 8->0, 1->7
        col: file, // a->0, h->7
      };
    }
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
    // Lichess format: solution = [opponent_move, player_move, opponent_move, player_move, ...]
    // Odd indices (1, 3, 5...) are player moves
    // Even indices (0, 2, 4...) are opponent moves (auto-played)
    
    // Convert from-to to UCI format
    const userMoveUCI = `${from}${to}`;
    
    // Get the expected player move at current moveIndex (should be odd: 1, 3, 5...)
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
        setMessage('Your turn - Find the best move!');
      }, 1500);
      return;
    }

    // Correct move!
    setBoard(chess.board());
    setLastMove({ from, to });
    setSelectedSquare(null);
    setLegalMoves([]);

    // Check if puzzle is solved (checkmate or no more moves in solution)
    if (chess.isCheckmate()) {
      setPuzzleState('SOLVED');
      setMessage('Checkmate! Puzzle solved!');
      setTimeout(() => {
        // Calculate hints used based on how many player moves were made
        const playerMovesMade = Math.ceil(moveIndex / 2);
        onPuzzleSolved(playerMovesMade);
      }, 1000);
      return;
    }

    // Check if there's an opponent response in the solution (next even index)
    const nextOpponentMoveIndex = moveIndex + 1;
    if (nextOpponentMoveIndex < playable.solution.length) {
      // Opponent needs to respond
      setPuzzleState('OPPONENT_MOVING');
      setMessage('Opponent is responding...');

      setTimeout(() => {
        playOpponentMove(nextOpponentMoveIndex);
      }, 800);
    } else {
      // No more moves - puzzle complete (might be winning position, not necessarily checkmate)
      setPuzzleState('SOLVED');
      setMessage('Puzzle complete! Well done!');
      setTimeout(() => {
        const playerMovesMade = Math.ceil(moveIndex / 2);
        onPuzzleSolved(playerMovesMade);
      }, 1000);
    }
  };

  const renderSquare = (visualRow: number, visualCol: number) => {
    // Calculate actual board array indices based on visual position
    // When flipped, visual row 0 = board row 0 (rank 1), visual col 0 = board col 7 (file h)
    // When not flipped, visual row 0 = board row 0 (rank 8), visual col 0 = board col 0 (file a)
    const boardRow = isFlipped ? visualRow : visualRow;
    const boardCol = isFlipped ? 7 - visualCol : visualCol;
    
    // Calculate if square is light/dark based on actual board position
    const actualFile = isFlipped ? 7 - visualCol : visualCol; // 0-7
    const actualRank = isFlipped ? visualRow : 7 - visualRow; // 0-7
    const isLight = (actualFile + actualRank) % 2 === 1; // Chess: a1 is dark
    
    const square = getSquareName(visualRow, visualCol);
    const piece = board[boardRow][boardCol];
    const isSelected = selectedSquare === square;
    const isLegalMove = legalMoves.includes(square);
    const isLastMoveSquare = lastMove && (lastMove.from === square || lastMove.to === square);

    return (
      <TouchableOpacity
        key={`${visualRow}-${visualCol}`}
        style={[
          styles.square,
          { backgroundColor: isLight ? '#F0D9B5' : '#B58863' },
          isSelected && styles.selectedSquare,
          isLastMoveSquare && styles.lastMoveSquare,
        ]}
        onPress={() => handleSquareTap(visualRow, visualCol)}
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
        {/* Rank labels - reversed when flipped */}
        <View style={styles.rankLabels}>
          {(isFlipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1]).map(rank => (
            <Text key={rank} style={styles.rankLabel}>{rank}</Text>
          ))}
        </View>
        
        <View style={styles.boardContainer}>
          <View style={styles.board}>
            {renderBoard()}
          </View>
          
          {/* File labels - reversed when flipped */}
          <View style={styles.fileLabels}>
            {(isFlipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']).map(file => (
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


// Memoize to prevent unnecessary re-renders on Android
export default memo(ChessPuzzleCard);

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
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  progressBadge: {
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 6,
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
