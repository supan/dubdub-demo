import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import axios from 'axios';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Category {
  category_id: string;
  name: string;
  icon: string;
  color: string;
  playable_count: number;
}

// Icon mapping
const ICON_MAP: Record<string, keyof typeof Ionicons.glyphMap> = {
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

export default function OnboardingScreen() {
  const { user, sessionToken, refreshUser } = useAuth();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const cardWidth = (width - 48) / 2 - 8;
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      if (!sessionToken) {
        setTimeout(() => router.replace('/'), 100);
        return;
      }
      await fetchCategories();
    };
    init();
  }, [sessionToken]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${BACKEND_URL}/api/categories`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      });
      setCategories(response.data.categories || []);
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

  const getIcon = (iconName: string): keyof typeof Ionicons.glyphMap => {
    return ICON_MAP[iconName] || 'help-circle';
  };

  if (loading) {
    return (
      <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00FF87" />
          <Text style={styles.loadingText}>Loading categories...</Text>
        </View>
      </LinearGradient>
    );
  }

  const canContinue = selectedCategories.length >= 3;

  return (
    <LinearGradient colors={['#0F0F1E', '#1A1A2E']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="infinite" size={48} color="#00FF87" />
        <Text style={styles.title}>What interests you?</Text>
        <Text style={styles.subtitle}>
          Select at least 3 categories to personalize your feed
        </Text>
        <View style={styles.counterBadge}>
          <Text style={[styles.counterText, canContinue && styles.counterTextGreen]}>
            {selectedCategories.length} / 3+ selected
          </Text>
        </View>
      </View>

      {/* Categories List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {categories.map((category) => {
            const isSelected = selectedCategories.includes(category.name);
            return (
              <TouchableOpacity
                key={category.category_id}
                style={[
                  styles.card,
                  { width: cardWidth },
                  isSelected && { borderColor: category.color }
                ]}
                onPress={() => toggleCategory(category.name)}
                activeOpacity={0.7}
              >
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: category.color }]}>
                    <Ionicons name="checkmark" size={12} color="#FFF" />
                  </View>
                )}
                <View style={[styles.iconBg, { backgroundColor: `${category.color}25` }]}>
                  <Ionicons name={getIcon(category.icon)} size={28} color={category.color} />
                </View>
                <Text style={styles.cardTitle}>{category.name}</Text>
                <Text style={styles.cardCount}>{category.playable_count} plays</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Error */}
      {error && (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color="#FF6B6B" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || submitting}
        >
          <LinearGradient
            colors={canContinue ? ['#00FF87', '#00D9FF'] : ['#333', '#222']}
            style={styles.continueGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={canContinue ? '#0F0F1E' : '#666'} />
            ) : (
              <>
                <Text style={[styles.continueBtnText, !canContinue && { color: '#666' }]}>
                  Continue
                </Text>
                <Ionicons 
                  name="arrow-forward" 
                  size={18} 
                  color={canContinue ? '#0F0F1E' : '#666'} 
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 12,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 6,
    textAlign: 'center',
  },
  counterBadge: {
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  counterText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '600',
  },
  counterTextGreen: {
    color: '#00FF87',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  cardCount: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 8,
  },
  continueBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  continueBtnDisabled: {
    opacity: 0.8,
  },
  continueGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  continueBtnText: {
    color: '#0F0F1E',
    fontSize: 16,
    fontWeight: '700',
  },
});
