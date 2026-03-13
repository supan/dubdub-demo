import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCategoryColor, getCategoryIcon, RADIUS, TYPOGRAPHY } from '../constants/theme';

interface CategoryBadgeProps {
  category: string;
  variant?: 'filled' | 'outline' | 'glass';
}

export default function CategoryBadge({ 
  category, 
  variant = 'filled' 
}: CategoryBadgeProps) {
  const categoryColor = getCategoryColor(category);
  const iconName = getCategoryIcon(category) as keyof typeof Ionicons.glyphMap;

  if (variant === 'glass') {
    return (
      <View style={[styles.container, styles.containerGlass]}>
        <Ionicons name={iconName} size={12} color="#FFFFFF" />
        <Text style={[styles.text, styles.textGlass]}>{category}</Text>
      </View>
    );
  }

  if (variant === 'outline') {
    return (
      <View style={[
        styles.container, 
        styles.containerOutline,
        { borderColor: categoryColor.primary }
      ]}>
        <Ionicons name={iconName} size={12} color={categoryColor.primary} />
        <Text style={[styles.text, { color: categoryColor.primary }]}>{category}</Text>
      </View>
    );
  }

  // Default: filled variant with category color
  return (
    <View style={[
      styles.container, 
      styles.containerFilled,
      { backgroundColor: categoryColor.primary }
    ]}>
      <Ionicons name={iconName} size={12} color="#0F0F1E" />
      <Text style={[styles.text, styles.textFilled]}>{category}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: RADIUS.sm,
    gap: 5,
  },
  containerFilled: {
    // Background color set dynamically
  },
  containerOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
  },
  containerGlass: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  text: {
    fontSize: TYPOGRAPHY.badge.fontSize,
    fontWeight: TYPOGRAPHY.badge.fontWeight,
    letterSpacing: TYPOGRAPHY.badge.letterSpacing,
    textTransform: 'uppercase',
  },
  textFilled: {
    color: '#0F0F1E',
  },
  textGlass: {
    color: '#FFFFFF',
    textShadowColor: '#000000',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
});
