import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  PanResponder,
  Animated,
} from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

// ─── Constants ──────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Difficulty = 'easy' | 'medium' | 'hard';

const DIFFICULTY_CONFIG: Record<Difficulty, { gridSize: number; wordCount: number; label: string }> = {
  easy: { gridSize: 10, wordCount: 8, label: 'Easy' },
  medium: { gridSize: 12, wordCount: 10, label: 'Medium' },
  hard: { gridSize: 14, wordCount: 12, label: 'Hard' },
};

const COLORS = {
  bg: '#0a0a1a',
  surface: '#141428',
  surfaceLight: '#1e1e3a',
  border: '#2a2a4a',
  text: '#e8e8ff',
  textDim: '#8888aa',
  accent: '#6c5ce7',
  accentLight: '#a29bfe',
  success: '#00e676',
  foundColors: [
    '#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff',
    '#5f27cd', '#01a3a4', '#f368e0', '#ff6348', '#7bed9f',
    '#70a1ff', '#ffa502',
  ],
};

const WORD_POOL: Record<Difficulty, string[]> = {
  easy: [
    'APPLE', 'GRAPE', 'LEMON', 'PEACH', 'MANGO', 'BERRY', 'MELON', 'PLUM',
    'PEAR', 'KIWI', 'CHERRY', 'OLIVE', 'FIG', 'LIME', 'DATE', 'GUAVA',
  ],
  medium: [
    'PYTHON', 'SWIFT', 'REACT', 'FLUTTER', 'KOTLIN', 'RUST', 'JAVA', 'RUBY',
    'DART', 'PERL', 'HASKELL', 'SCALA', 'ELIXIR', 'GOLANG', 'LUA', 'ERLANG',
  ],
  hard: [
    'ANDROID', 'KUBERNETES', 'DOCKER', 'TERRAFORM', 'WEBPACK', 'REDUX',
    'GRAPHQL', 'FIREBASE', 'DOCKER', 'JENKINS', 'FLUTTER', 'EXPRESS',
    'MONGODB', 'POSTGRES', 'REDIS', 'NGINX',
  ],
};

// 8 directions: right, down-right, down, down-left, left, up-left, up, up-right
const DIRECTIONS: [number, number][] = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1],
];

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlacedWord {
  word: string;
  startRow: number;
  startCol: number;
  direction: number; // index into DIRECTIONS
  cells: [number, number][];
}

interface SelectionCell {
  row: number;
  col: number;
}

// ─── Grid generation ────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateGrid(difficulty: Difficulty): {
  grid: string[][];
  placedWords: PlacedWord[];
} {
  const config = DIFFICULTY_CONFIG[difficulty];
  const size = config.gridSize;
  const grid: string[][] = Array.from({ length: size }, () =>
    Array(size).fill('')
  );

  const pool = shuffleArray(WORD_POOL[difficulty]);
  const wordsToPlace = pool.slice(0, config.wordCount + 4); // extra in case some fail
  const placedWords: PlacedWord[] = [];

  for (const word of wordsToPlace) {
    if (placedWords.length >= config.wordCount) break;
    const upper = word.toUpperCase();
    const dirOrder = shuffleArray([0, 1, 2, 3, 4, 5, 6, 7]);

    let placed = false;
    for (const dirIdx of dirOrder) {
      if (placed) break;
      const [dr, dc] = DIRECTIONS[dirIdx];
      const endRow = (upper.length - 1) * dr;
      const endCol = (upper.length - 1) * dc;

      // Calculate valid start ranges
      const minRow = Math.max(0, -endRow);
      const maxRow = Math.min(size - 1, size - 1 - endRow);
      const minCol = Math.max(0, -endCol);
      const maxCol = Math.min(size - 1, size - 1 - endCol);

      if (minRow > maxRow || minCol > maxCol) continue;

      // Try random positions
      const rowCandidates: number[] = [];
      for (let r = minRow; r <= maxRow; r++) rowCandidates.push(r);
      const colCandidates: number[] = [];
      for (let c = minCol; c <= maxCol; c++) colCandidates.push(c);

      const shuffledRows = shuffleArray(rowCandidates);
      const shuffledCols = shuffleArray(colCandidates);

      for (const sr of shuffledRows) {
        if (placed) break;
        for (const sc of shuffledCols) {
          if (placed) break;

          // Check if word fits
          let fits = true;
          const cells: [number, number][] = [];
          for (let i = 0; i < upper.length; i++) {
            const r = sr + i * dr;
            const c = sc + i * dc;
            if (r < 0 || r >= size || c < 0 || c >= size) {
              fits = false;
              break;
            }
            const existing = grid[r][c];
            if (existing !== '' && existing !== upper[i]) {
              fits = false;
              break;
            }
            cells.push([r, c]);
          }

          if (fits) {
            // Place the word
            for (let i = 0; i < upper.length; i++) {
              grid[cells[i][0]][cells[i][1]] = upper[i];
            }
            placedWords.push({
              word: upper,
              startRow: sr,
              startCol: sc,
              direction: dirIdx,
              cells,
            });
            placed = true;
          }
        }
      }
    }
  }

  // Fill empty cells with random letters
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = alphabet[Math.floor(Math.random() * 26)];
      }
    }
  }

  return { grid, placedWords };
}

// ─── Helper: check if selection is a valid straight line ────────────────────

function getLineCells(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): SelectionCell[] {
  const dr = endRow - startRow;
  const dc = endCol - startCol;

  if (dr === 0 && dc === 0) {
    return [{ row: startRow, col: startCol }];
  }

  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  // Must be horizontal, vertical, or diagonal (45 degrees)
  if (absDr !== 0 && absDc !== 0 && absDr !== absDc) {
    return [];
  }

  const steps = Math.max(absDr, absDc);
  const stepR = dr === 0 ? 0 : dr / absDr;
  const stepC = dc === 0 ? 0 : dc / absDc;

  const cells: SelectionCell[] = [];
  for (let i = 0; i <= steps; i++) {
    cells.push({
      row: startRow + i * stepR,
      col: startCol + i * stepC,
    });
  }
  return cells;
}

// ─── Cell Index Helper ──────────────────────────────────────────────────────

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

// ─── App Component ──────────────────────────────────────────────────────────

export default function App() {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [grid, setGrid] = useState<string[][]>([]);
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([]);
  const [foundWords, setFoundWords] = useState<Set<string>>(new Set());
  const [cellColors, setCellColors] = useState<Map<string, string>>(new Map());
  const [selection, setSelection] = useState<SelectionCell[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [startCell, setStartCell] = useState<SelectionCell | null>(null);
  const [timer, setTimer] = useState(0);
  const [gameComplete, setGameComplete] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);

  const gridRef = useRef<View>(null);
  const gridLayout = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentStartCell = useRef<SelectionCell | null>(null);
  const foundWordsRef = useRef<Set<string>>(new Set());
  const placedWordsRef = useRef<PlacedWord[]>([]);
  const cellColorsRef = useRef<Map<string, string>>(new Map());
  const colorIndexRef = useRef(0);
  const selectionRef = useRef<SelectionCell[]>([]);

  // Animated values
  const scoreScale = useRef(new Animated.Value(1)).current;
  const completeOpacity = useRef(new Animated.Value(0)).current;

  // Keep refs in sync
  useEffect(() => {
    foundWordsRef.current = foundWords;
  }, [foundWords]);
  useEffect(() => {
    placedWordsRef.current = placedWords;
  }, [placedWords]);
  useEffect(() => {
    cellColorsRef.current = cellColors;
  }, [cellColors]);
  useEffect(() => {
    colorIndexRef.current = colorIndex;
  }, [colorIndex]);

  // Timer
  useEffect(() => {
    if (difficulty && !gameComplete) {
      timerRef.current = setInterval(() => {
        setTimer((t) => t + 1);
      }, 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [difficulty, gameComplete]);

  // Check game complete
  useEffect(() => {
    if (
      placedWords.length > 0 &&
      foundWords.size === placedWords.length &&
      !gameComplete
    ) {
      if (timerRef.current) clearInterval(timerRef.current);
      setGameComplete(true);
      Animated.timing(completeOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }).start();
    }
  }, [foundWords, placedWords.length]);

  const startNewGame = useCallback((diff: Difficulty) => {
    const { grid: newGrid, placedWords: newWords } = generateGrid(diff);
    setDifficulty(diff);
    setGrid(newGrid);
    setPlacedWords(newWords);
    setFoundWords(new Set());
    setCellColors(new Map());
    setSelection([]);
    setSelecting(false);
    setStartCell(null);
    setTimer(0);
    setGameComplete(false);
    setColorIndex(0);
    completeOpacity.setValue(0);

    // Reset refs
    foundWordsRef.current = new Set();
    placedWordsRef.current = newWords;
    cellColorsRef.current = new Map();
    colorIndexRef.current = 0;
    currentStartCell.current = null;
  }, [completeOpacity]);

  const getCellSize = useCallback(() => {
    if (!difficulty) return 30;
    const size = DIFFICULTY_CONFIG[difficulty].gridSize;
    const gridWidth = Math.min(SCREEN_WIDTH - 24, 400);
    return Math.floor(gridWidth / size);
  }, [difficulty]);

  const getCellFromTouch = useCallback(
    (x: number, y: number): SelectionCell | null => {
      if (!difficulty) return null;
      const size = DIFFICULTY_CONFIG[difficulty].gridSize;
      const cellSize = getCellSize();
      const gridWidth = cellSize * size;

      const localX = x - gridLayout.current.x;
      const localY = y - gridLayout.current.y;

      // Account for centering offset
      const offsetX = (gridLayout.current.width - gridWidth) / 2;
      const adjustedX = localX - offsetX;
      const adjustedY = localY;

      const col = Math.floor(adjustedX / cellSize);
      const row = Math.floor(adjustedY / cellSize);

      if (row >= 0 && row < size && col >= 0 && col < size) {
        return { row, col };
      }
      return null;
    },
    [difficulty, getCellSize]
  );

  const checkSelection = useCallback(
    (cells: SelectionCell[]) => {
      if (cells.length < 2) return;

      const word = cells.map((c) => grid[c.row]?.[c.col] || '').join('');
      const reversedWord = word.split('').reverse().join('');

      for (const pw of placedWordsRef.current) {
        if (foundWordsRef.current.has(pw.word)) continue;
        if (pw.word === word || pw.word === reversedWord) {
          // Found a word!
          const newFound = new Set(foundWordsRef.current);
          newFound.add(pw.word);
          setFoundWords(newFound);
          foundWordsRef.current = newFound;

          const newColors = new Map(cellColorsRef.current);
          const ci = colorIndexRef.current % COLORS.foundColors.length;
          const color = COLORS.foundColors[ci];
          for (const [r, c] of pw.cells) {
            newColors.set(cellKey(r, c), color);
          }
          setCellColors(newColors);
          cellColorsRef.current = newColors;

          const nextCI = colorIndexRef.current + 1;
          setColorIndex(nextCI);
          colorIndexRef.current = nextCI;

          // Animate score
          scoreScale.setValue(1.3);
          Animated.spring(scoreScale, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
          }).start();

          return;
        }
      }
    },
    [grid]
  );

  // PanResponder for drag selection
  // Store selecting state in a ref so PanResponder callbacks aren't stale
  const selectingRef = useRef(false);
  selectingRef.current = selecting;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const cell = getCellFromTouch(
          evt.nativeEvent.pageX,
          evt.nativeEvent.pageY
        );
        if (cell) {
          currentStartCell.current = cell;
          const cells = [cell];
          selectionRef.current = cells;
          setStartCell(cell);
          setSelection(cells);
          setSelecting(true);
          selectingRef.current = true;
        }
      },
      onPanResponderMove: (evt) => {
        if (!currentStartCell.current || !selectingRef.current) return;
        const cell = getCellFromTouch(
          evt.nativeEvent.pageX,
          evt.nativeEvent.pageY
        );
        if (cell && currentStartCell.current) {
          const lineCells = getLineCells(
            currentStartCell.current.row,
            currentStartCell.current.col,
            cell.row,
            cell.col
          );
          selectionRef.current = lineCells;
          setSelection(lineCells);
        }
      },
      onPanResponderRelease: () => {
        const currentSelection = selectionRef.current;
        if (currentSelection.length >= 2) {
          checkSelection(currentSelection);
        }
        selectionRef.current = [];
        setSelection([]);
        setSelecting(false);
        selectingRef.current = false;
        setStartCell(null);
        currentStartCell.current = null;
      },
      onPanResponderTerminate: () => {
        selectionRef.current = [];
        setSelection([]);
        setSelecting(false);
        selectingRef.current = false;
        setStartCell(null);
        currentStartCell.current = null;
      },
    })
  ).current;

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ─── Menu Screen ────────────────────────────────────────────────────────

  if (!difficulty) {
    return (
      <SafeAreaView style={styles.container}>
        <ExpoStatusBar style="light" />
        <View style={styles.menuContainer}>
          <Text style={styles.title}>🔍 Word Search</Text>
          <Text style={styles.subtitle}>Sopa de Letras</Text>
          <View style={styles.menuDivider} />
          <Text style={styles.menuLabel}>Select Difficulty</Text>
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => (
            <TouchableOpacity
              key={diff}
              style={[styles.diffButton, { borderColor: COLORS.accent }]}
              onPress={() => startNewGame(diff)}
              activeOpacity={0.7}
            >
              <Text style={styles.diffButtonText}>
                {DIFFICULTY_CONFIG[diff].label}
              </Text>
              <Text style={styles.diffButtonSub}>
                {DIFFICULTY_CONFIG[diff].gridSize}×{DIFFICULTY_CONFIG[diff].gridSize} · {DIFFICULTY_CONFIG[diff].wordCount} words
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>
    );
  }

  // ─── Game Screen ────────────────────────────────────────────────────────

  const config = DIFFICULTY_CONFIG[difficulty];
  const cellSize = getCellSize();
  const gridPixelSize = cellSize * config.gridSize;

  const selectionSet = new Set(selection.map((c) => cellKey(c.row, c.col)));

  return (
    <SafeAreaView style={styles.container}>
      <ExpoStatusBar style="light" />
      <View style={styles.gameContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Word Search</Text>
            <Text style={styles.headerDiff}>{config.label}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>TIME</Text>
              <Text style={styles.statValue}>{formatTime(timer)}</Text>
            </View>
            <Animated.View style={{ transform: [{ scale: scoreScale }] }}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>FOUND</Text>
                <Text style={[styles.statValue, { color: COLORS.success }]}>
                  {foundWords.size}/{placedWords.length}
                </Text>
              </View>
            </Animated.View>
          </View>
        </View>

        {/* Grid */}
        <View
          ref={gridRef}
          style={styles.gridWrapper}
          onLayout={(e) => {
            gridLayout.current = e.nativeEvent.layout;
          }}
          {...panResponder.panHandlers}
        >
          <View
            style={[
              styles.grid,
              {
                width: gridPixelSize,
                height: gridPixelSize,
              },
            ]}
          >
            {grid.map((row, r) => (
              <View key={r} style={styles.row}>
                {row.map((letter, c) => {
                  const key = cellKey(r, c);
                  const foundColor = cellColors.get(key) || null;
                  const isSelected = selectionSet.has(key);
                  const cellLetter = grid[r]?.[c] || '';

                  return (
                    <View
                      key={c}
                      style={[
                        styles.cell,
                        {
                          width: cellSize,
                          height: cellSize,
                        },
                        isSelected && styles.cellSelected,
                        foundColor
                          ? {
                              backgroundColor: foundColor + '40',
                              borderColor: foundColor,
                            }
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          { fontSize: Math.max(cellSize * 0.42, 10) },
                          isSelected && styles.cellTextSelected,
                          foundColor && { color: foundColor },
                        ]}
                      >
                        {cellLetter}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Selection line overlay hint */}
          {selecting && selection.length >= 2 && (
            <View style={styles.selectionOverlay} pointerEvents="none">
              <Text style={styles.selectionText}>
                {selection.map((c) => grid[c.row]?.[c.col] || '').join('')}
              </Text>
            </View>
          )}
        </View>

        {/* Word List */}
        <View style={styles.wordListContainer}>
          <Text style={styles.wordListTitle}>Words to Find</Text>
          <View style={styles.wordList}>
            {placedWords.map((pw, idx) => {
              const isFound = foundWords.has(pw.word);
              return (
                <View
                  key={pw.word + idx}
                  style={[
                    styles.wordChip,
                    isFound && {
                      backgroundColor:
                        (cellColors.get(cellKey(pw.cells[0][0], pw.cells[0][1])) ||
                          COLORS.success) + '30',
                      borderColor:
                        cellColors.get(cellKey(pw.cells[0][0], pw.cells[0][1])) ||
                        COLORS.success,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.wordChipText,
                      isFound && {
                        textDecorationLine: 'line-through',
                        color: COLORS.textDim,
                      },
                    ]}
                  >
                    {pw.word}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: COLORS.accent }]}
            onPress={() => startNewGame(difficulty)}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>New Game</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: COLORS.surfaceLight }]}
            onPress={() => {
              if (timerRef.current) clearInterval(timerRef.current);
              setDifficulty(null);
              setGameComplete(false);
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Menu</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Game Complete Overlay */}
      {gameComplete && (
        <Animated.View
          style={[styles.completeOverlay, { opacity: completeOpacity }]}
        >
          <View style={styles.completeCard}>
            <Text style={styles.completeEmoji}>🎉</Text>
            <Text style={styles.completeTitle}>Congratulations!</Text>
            <Text style={styles.completeText}>
              You found all {placedWords.length} words!
            </Text>
            <Text style={styles.completeTime}>
              Time: {formatTime(timer)}
            </Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.accent, marginTop: 20 }]}
              onPress={() => startNewGame(difficulty)}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Play Again</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.surfaceLight, marginTop: 10 }]}
              onPress={() => {
                setGameComplete(false);
                setDifficulty(null);
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.buttonText}>Change Difficulty</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  menuContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.accentLight,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  menuDivider: {
    width: 60,
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
    marginBottom: 24,
  },
  menuLabel: {
    fontSize: 14,
    color: COLORS.textDim,
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  diffButton: {
    width: '100%',
    paddingVertical: 16,
    paddingHorizontal: 24,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    alignItems: 'center',
  },
  diffButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  diffButtonSub: {
    fontSize: 12,
    color: COLORS.textDim,
    marginTop: 2,
  },
  gameContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerDiff: {
    fontSize: 12,
    color: COLORS.accentLight,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  statBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statLabel: {
    fontSize: 9,
    color: COLORS.textDim,
    fontWeight: '700',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginTop: 2,
  },
  gridWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 100,
  },
  grid: {
    flexDirection: 'column',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 4,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: COLORS.border,
    borderRadius: 3,
  },
  cellSelected: {
    backgroundColor: COLORS.accent + '50',
    borderColor: COLORS.accentLight,
    borderWidth: 1.5,
  },
  cellText: {
    fontWeight: 'bold',
    color: COLORS.text,
    includeFontPadding: false,
    textAlign: 'center',
  },
  cellTextSelected: {
    color: '#ffffff',
    textShadowColor: COLORS.accent,
    textShadowRadius: 4,
  },
  selectionOverlay: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  selectionText: {
    fontSize: 14,
    color: COLORS.accentLight,
    fontWeight: 'bold',
    backgroundColor: COLORS.surface + 'cc',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  wordListContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  wordListTitle: {
    fontSize: 12,
    color: COLORS.textDim,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  wordList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  wordChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  wordChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    includeFontPadding: false,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  completeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.accent,
    marginHorizontal: 30,
  },
  completeEmoji: {
    fontSize: 48,
    marginBottom: 10,
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  completeText: {
    fontSize: 14,
    color: COLORS.textDim,
  },
  completeTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.success,
    marginTop: 6,
  },
});
