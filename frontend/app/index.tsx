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
          <Ionicons name="infinite" size={100} color="#fff" />
          <Text style={styles.title}>Invin</Text>
          <Text style={styles.tagline}>Quick Play. Infinite Wins</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.description}>
            Challenge yourself with endless{' \n'}playable content
          </Text>
          <Text style={styles.subDescription}>
            Build streaks • Track progress • Win big
          </Text>
        </View>

        <View style={styles.bottomContent}>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={login}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-google" size={24} color="#fff" style={styles.googleIcon} />
            <Text style={styles.loginButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <Text style={styles.footerText}>Join the winning community</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 32,
    paddingTop: 80,
    paddingBottom: 50,
  },
  header: {
    alignItems: 'center',
  },
  title: {
    fontSize: 72,
    fontWeight: '800',
    color: '#fff',
    marginTop: 20,
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.95,
    letterSpacing: 0.5,
  },
  centerContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 18,
    fontWeight: '400',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    opacity: 0.9,
  },
  subDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
    textAlign: 'center',
    marginTop: 12,
    opacity: 1,
  },
  bottomContent: {
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    elevation: 10,
  },
  googleIcon: {
    marginRight: 12,
    color: '#667eea',
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#667eea',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#fff',
    opacity: 0.7,
    marginTop: 20,
  },
});
