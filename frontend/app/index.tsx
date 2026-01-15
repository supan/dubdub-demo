import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { user, login, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user && !loading) {
      router.replace('/feed');
    }
  }, [user, loading]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00FF87" />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={['#0F0F1E', '#1A1A2E', '#16213E']}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Ionicons name="infinite" size={100} color="#00FF87" />
          <Text style={styles.title}>Invin</Text>
          <Text style={styles.tagline}>Quick Play. Infinite Wins</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.description}>
            Challenge yourself with infinite plays
          </Text>
        </View>

        <View style={styles.bottomContent}>
          <TouchableOpacity
            style={styles.loginButton}
            onPress={login}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#00FF87', '#00D9FF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.buttonGradient}
            >
              <Ionicons name="logo-google" size={24} color="#0F0F1E" style={styles.googleIcon} />
              <Text style={styles.loginButtonText}>Continue with Google</Text>
            </LinearGradient>
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
    color: '#FFFFFF',
    marginTop: 20,
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00FF87',
    marginTop: 8,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  centerContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  description: {
    fontSize: 20,
    fontWeight: '600',
    color: '#00D9FF',
    textAlign: 'center',
    lineHeight: 28,
  },
  bottomContent: {
    width: '100%',
    alignItems: 'center',
  },
  loginButton: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
  },
  buttonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 40,
  },
  googleIcon: {
    marginRight: 12,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  footerText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#B0B0C8',
    marginTop: 20,
  },
});
