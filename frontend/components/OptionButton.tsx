import React, { useRef, useEffect } from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  Animated,
  View,
} from 'react-native';
import { INTERACTIVE_COLORS, ANIMATION, RADIUS, TYPOGRAPHY, COLORS } from '../constants/theme';

interface OptionButtonProps {
  label: string;
  index: number;
  isSelected: boolean;
  onPress: () => void;
  disabled?: boolean;
  accentColor?: string;
  fullWidth?: boolean;
  variant?: 'standard' | 'glass';
}

export default function OptionButton({
  label,
  index,
  isSelected,
  onPress,
  disabled = false,
  accentColor = INTERACTIVE_COLORS.selected.border,
  fullWidth = false,
  variant = 'standard',
}: OptionButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  // Staggered entrance animation
  useEffect(() => {
    opacityAnim.setValue(0);
    Animated.timing(opacityAnim, {
      toValue: 1,
      duration: ANIMATION.normal,
      delay: index * ANIMATION.stagger,
      useNativeDriver: true,
    }).start();
  }, [index]);

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: INTERACTIVE_COLORS.pressed.scale,
      duration: ANIMATION.fast,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const isGlass = variant === 'glass';

  // Dynamic styles based on state
  const containerStyle = [
    styles.container,
    fullWidth ? styles.fullWidth : styles.halfWidth,
    isGlass ? styles.containerGlass : styles.containerStandard,
    isSelected && {
      borderColor: accentColor,
      backgroundColor: isGlass 
        ? `${accentColor}18` 
        : INTERACTIVE_COLORS.selected.background,
    },
  ];

  const textStyle = [
    styles.label,
    isGlass && styles.labelGlass,
    isSelected && { color: '#FFFFFF' },
    fullWidth && styles.labelFullWidth,
  ];

  // Option letter indicator (A, B, C, D)
  const optionLetter = String.fromCharCode(65 + index);

  return (
    <Animated.View
      style={[
        { opacity: opacityAnim, transform: [{ scale: scaleAnim }] },
        fullWidth ? styles.wrapperFull : styles.wrapperHalf,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={containerStyle}
        android_ripple={{ color: 'rgba(255,255,255,0.1)', borderless: false }}
      >
        {/* Option letter badge */}
        <View style={[
          styles.letterBadge,
          isSelected && { backgroundColor: accentColor },
        ]}>
          <Text style={[
            styles.letterText,
            isSelected && styles.letterTextSelected,
          ]}>
            {optionLetter}
          </Text>
        </View>
        
        {/* Option text */}
        <Text
          style={textStyle}
          numberOfLines={fullWidth ? undefined : 2}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapperHalf: {
    width: '48%',
  },
  wrapperFull: {
    width: '100%',
  },
  container: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  containerStandard: {
    backgroundColor: INTERACTIVE_COLORS.default.background,
    borderColor: INTERACTIVE_COLORS.default.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 56,
  },
  containerGlass: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  halfWidth: {
    // Additional styles for 2-column layout
  },
  fullWidth: {
    // Additional styles for single column
  },
  letterBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  letterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text.secondary,
  },
  letterTextSelected: {
    color: '#0F0F1E',
  },
  label: {
    flex: 1,
    fontSize: TYPOGRAPHY.option.fontSize,
    fontWeight: TYPOGRAPHY.option.fontWeight,
    lineHeight: TYPOGRAPHY.option.lineHeight,
    color: COLORS.text.primary,
  },
  labelGlass: {
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  labelFullWidth: {
    textAlign: 'left',
  },
});
