import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { user, login, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If user is authenticated, navigate to feed
    if (user && !loading) {
      router.replace('/feed');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#FF6B9D" />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#667eea', '#764ba2', '#f093fb']}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="game-controller" size={80} color="#fff" />
          <Text style={styles.title}>PlayQuiz</Text>
          <Text style={styles.subtitle}>Test your knowledge, build your streak!</Text>
        </View>

        <View style={styles.features}>
          <FeatureItem icon="flash" text="Multiple question formats" />
          <FeatureItem icon="trophy" text="Track your streaks" />
          <FeatureItem icon="stats-chart" text="Compete with friends" />
        </View>

        <TouchableOpacity
          style={styles.loginButton}
          onPress={login}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={24} color="#fff" style={styles.googleIcon} />
          <Text style={styles.loginButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <Text style={styles.footerText}>Join thousands of players worldwide</Text>
      </View>
    </LinearGradient>
  );
}

const FeatureItem = ({ icon, text }: { icon: any; text: string }) => (
  <View style={styles.featureItem}>
    <Ionicons name={icon} size={24} color="#FFD700" />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.9,
  },
  features: {
    width: '100%',
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 30,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  googleIcon: {
    marginRight: 12,
    color: '#667eea',
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#667eea',
  },
  footerText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.8,
    marginBottom: 20,
  },
});
