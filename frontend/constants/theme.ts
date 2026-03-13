/**
 * Shared Theme System
 * Category-based colors and design tokens for consistent styling
 */

// Category color mapping with enhanced accent colors
export const CATEGORY_COLORS: Record<string, { primary: string; light: string; dark: string; gradient: [string, string] }> = {
  'Cricket': {
    primary: '#22C55E',
    light: 'rgba(34, 197, 94, 0.12)',
    dark: 'rgba(34, 197, 94, 0.22)',
    gradient: ['#22C55E', '#16A34A'],
  },
  'Bollywood': {
    primary: '#F43F5E',
    light: 'rgba(244, 63, 94, 0.12)',
    dark: 'rgba(244, 63, 94, 0.22)',
    gradient: ['#F43F5E', '#E11D48'],
  },
  'Pop Culture': {
    primary: '#A855F7',
    light: 'rgba(168, 85, 247, 0.12)',
    dark: 'rgba(168, 85, 247, 0.22)',
    gradient: ['#A855F7', '#9333EA'],
  },
  'Maths': {
    primary: '#3B82F6',
    light: 'rgba(59, 130, 246, 0.12)',
    dark: 'rgba(59, 130, 246, 0.22)',
    gradient: ['#3B82F6', '#2563EB'],
  },
  'GK': {
    primary: '#F59E0B',
    light: 'rgba(245, 158, 11, 0.12)',
    dark: 'rgba(245, 158, 11, 0.22)',
    gradient: ['#F59E0B', '#D97706'],
  },
  'Football': {
    primary: '#06B6D4',
    light: 'rgba(6, 182, 212, 0.12)',
    dark: 'rgba(6, 182, 212, 0.22)',
    gradient: ['#06B6D4', '#0891B2'],
  },
  'Indian TV shows': {
    primary: '#EC4899',
    light: 'rgba(236, 72, 153, 0.12)',
    dark: 'rgba(236, 72, 153, 0.22)',
    gradient: ['#EC4899', '#DB2777'],
  },
  'Nostalgia': {
    primary: '#F97316',
    light: 'rgba(249, 115, 22, 0.12)',
    dark: 'rgba(249, 115, 22, 0.22)',
    gradient: ['#F97316', '#EA580C'],
  },
  'Politics': {
    primary: '#8B5CF6',
    light: 'rgba(139, 92, 246, 0.12)',
    dark: 'rgba(139, 92, 246, 0.22)',
    gradient: ['#8B5CF6', '#7C3AED'],
  },
  'Sports': {
    primary: '#10B981',
    light: 'rgba(16, 185, 129, 0.12)',
    dark: 'rgba(16, 185, 129, 0.22)',
    gradient: ['#10B981', '#059669'],
  },
  'Science': {
    primary: '#14B8A6',
    light: 'rgba(20, 184, 166, 0.12)',
    dark: 'rgba(20, 184, 166, 0.22)',
    gradient: ['#14B8A6', '#0D9488'],
  },
  'History': {
    primary: '#EAB308',
    light: 'rgba(234, 179, 8, 0.12)',
    dark: 'rgba(234, 179, 8, 0.22)',
    gradient: ['#EAB308', '#CA8A04'],
  },
  'Geography': {
    primary: '#84CC16',
    light: 'rgba(132, 204, 22, 0.12)',
    dark: 'rgba(132, 204, 22, 0.22)',
    gradient: ['#84CC16', '#65A30D'],
  },
};

// Default color for unknown categories
export const DEFAULT_CATEGORY_COLOR = {
  primary: '#64748B',
  light: 'rgba(100, 116, 139, 0.12)',
  dark: 'rgba(100, 116, 139, 0.22)',
  gradient: ['#64748B', '#475569'] as [string, string],
};

// Get category color with fallback
export const getCategoryColor = (category: string) => {
  return CATEGORY_COLORS[category] || DEFAULT_CATEGORY_COLOR;
};

// Card background gradients
export const CARD_BACKGROUNDS = {
  dark: ['#0F0F1E', '#1A1A2E'] as [string, string],
  elevated: ['#1A1A2E', '#252540'] as [string, string],
  glass: ['rgba(255,255,255,0.05)', 'rgba(255,255,255,0.02)'] as [string, string],
};

// Base colors
export const COLORS = {
  background: '#0F0F1E',
  surface: '#1A1A2E',
  surfaceElevated: '#252540',
  border: '#2A2A3E',
  borderLight: 'rgba(255,255,255,0.08)',
  text: {
    primary: '#FFFFFF',
    secondary: '#B0B0C8',
    tertiary: '#6B7280',
    muted: 'rgba(255,255,255,0.5)',
  },
  accent: {
    cyan: '#00D9FF',
    green: '#00FF87',
    orange: '#FF6B00',
    gold: '#FFD700',
  },
};

// Category icons mapping
export const CATEGORY_ICONS: Record<string, string> = {
  'Cricket': 'tennisball',
  'Bollywood': 'film',
  'Pop Culture': 'sparkles',
  'Maths': 'calculator',
  'GK': 'globe',
  'Football': 'football',
  'Indian TV shows': 'tv',
  'Nostalgia': 'time',
  'Politics': 'people',
};

// Get category icon with fallback
export const getCategoryIcon = (category: string): string => {
  return CATEGORY_ICONS[category] || 'help-circle';
};

// Interactive element colors (neutral - doesn't imply correct/incorrect)
export const INTERACTIVE_COLORS = {
  // Selection state - cyan/blue (neutral)
  selected: {
    border: '#00D9FF',
    background: 'rgba(0, 217, 255, 0.12)',
    glow: 'rgba(0, 217, 255, 0.3)',
  },
  // Default state
  default: {
    border: '#2A2A3E',
    background: '#1E1E2E',
    backgroundHover: 'rgba(255, 255, 255, 0.04)',
  },
  // Pressed state
  pressed: {
    background: 'rgba(255, 255, 255, 0.08)',
    scale: 0.98,
  },
};

// Feedback colors (reserved for correct/incorrect)
export const FEEDBACK_COLORS = {
  correct: {
    primary: '#22C55E',
    background: 'rgba(34, 197, 94, 0.15)',
    border: 'rgba(34, 197, 94, 0.4)',
  },
  incorrect: {
    primary: '#EF4444',
    background: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
  },
};

// Animation durations (subtle)
export const ANIMATION = {
  instant: 50,
  fast: 100,
  normal: 150,
  slow: 200,
  stagger: 30, // Delay between staggered items
};

// Border radius tokens
export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

// Typography - refined with better hierarchy
export const TYPOGRAPHY = {
  // Question text - prominent and readable
  question: {
    fontSize: 22,
    lineHeight: 32,
    fontWeight: '600' as const,
    letterSpacing: -0.3,
  },
  // Option text - clear and scannable  
  option: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
  },
  // Category badge - compact uppercase
  badge: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  // Progress indicator
  progress: {
    fontSize: 13,
    fontWeight: '700' as const,
  },
};

// Spacing - generous whitespace
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  cardPadding: 20,
  optionGap: 10,
  sectionGap: 24,
};

// Shadows
export const SHADOWS = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  button: {
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
};
