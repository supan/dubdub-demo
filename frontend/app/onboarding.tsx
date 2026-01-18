import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 60) / 2;

interface Category {
  category_id: string;
  name: string;
  icon: string;
  color: string;
  playable_count: number;
}

export default function OnboardingScreen() {
  const { user, sessionToken, refreshUser } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for component to mount before navigation
    const timer = setTimeout(() => {
      if (!sessionToken) {
        router.replace('/');
        return;
      }
      fetchCategories();
    }, 100);
    
    return () => clearTimeout(timer);
  }, [sessionToken]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/categories`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      setCategories(response.data.categories);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (categoryName: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(categoryName)) {
        return prev.filter(c => c !== categoryName);
      }
      return [...prev, categoryName];
    });
    setError(null);
  };

  const handleContinue = async () => {
    if (selectedCategories.length < 3) {
      setError('Please select at least 3 categories');
      return;
    }

    try {
      setSubmitting(true);
      await axios.post(
        `${BACKEND_URL}/api/categories/select`,
        { categories: selectedCategories },
        { headers: { Authorization: `Bearer ${sessionToken}` } }
      );
      
      await refreshUser();
      router.replace('/feed');
    } catch (err: any) {
      console.error('Error saving categories:', err);
      setError(err.response?.data?.detail || 'Failed to save categories');
    } finally {
      setSubmitting(false);
    }
  };

  const getIconName = (iconName: string): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      'flask': 'flask',
      'globe': 'globe',
      'time': 'time',
      'book': 'book',
      'football': 'football',
      'musical-notes': 'musical-notes',
      'color-palette': 'color-palette',
      'film': 'film',
      'hardware-chip': 'hardware-chip',
      'restaurant': 'restaurant',
      'leaf': 'leaf',
      'paw': 'paw',
      'calculator': 'calculator',
      'language': 'language',
      'help-circle': 'help-circle',
    };
    return iconMap[iconName] || 'help-circle';
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <ActivityIndicator size="large" color="#00FF87" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <Ionicons name="infinite" size={40} color="#00FF87" />
        </View>
        <Text style={styles.title}>What interests you?</Text>
        <Text style={styles.subtitle}>
          Select at least 3 categories to personalize your experience
        </Text>
      </View>

      {/* Selection Counter */}
      <View style={styles.counterContainer}>
        <Text style={[
          styles.counterText,
          selectedCategories.length >= 3 && styles.counterTextValid
        ]}>
          {selectedCategories.length} selected
          {selectedCategories.length < 3 && ` (${3 - selectedCategories.length} more needed)`}
        </Text>
      </View>

      {/* Categories Grid */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        {categories.length === 0 ? (
          <View style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#888' }}>Loading categories...</Text>
          </View>
        ) : (
          categories.map((category) => {
            const isSelected = selectedCategories.includes(category.name);
            return (
              <TouchableOpacity
                key={category.category_id}
                style={[
                  styles.categoryCard,
                  isSelected && { borderColor: category.color, borderWidth: 3 }
                ]}
                onPress={() => toggleCategory(category.name)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconCircle, { backgroundColor: category.color + '20' }]}>
                  <Ionicons 
                    name={getIconName(category.icon)} 
                    size={32} 
                    color={category.color} 
                  />
                </View>
                <Text style={styles.categoryName} numberOfLines={1}>
                  {category.name}
                </Text>
                <Text style={styles.playableCount}>
                  {category.playable_count} plays
                </Text>
                {isSelected && (
                  <View style={[styles.checkBadge, { backgroundColor: category.color }]}>
                    <Ionicons name="checkmark" size={14} color="#FFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Error Message */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="warning" size={18} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            selectedCategories.length < 3 && styles.continueButtonDisabled
          ]}
          onPress={handleContinue}
          disabled={selectedCategories.length < 3 || submitting}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={selectedCategories.length >= 3 ? ['#00FF87', '#00D9FF'] : ['#3A3A4A', '#2A2A3A']}
            style={styles.continueGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#0F0F1E" />
            ) : (
              <>
                <Text style={[
                  styles.continueText,
                  selectedCategories.length < 3 && styles.continueTextDisabled
                ]}>
                  Continue
                </Text>
                <Ionicons 
                  name="arrow-forward" 
                  size={20} 
                  color={selectedCategories.length >= 3 ? '#0F0F1E' : '#666'} 
                />
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  counterContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
  },
  counterText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  counterTextValid: {
    color: '#00FF87',
  },
  scrollView: {
    flex: 1,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: CARD_WIDTH,
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 4,
  },
  playableCount: {
    fontSize: 12,
    color: '#666',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
    gap: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    paddingTop: 12,
  },
  continueButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  continueButtonDisabled: {
    opacity: 0.7,
  },
  continueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  continueText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  continueTextDisabled: {
    color: '#666',
  },
});
