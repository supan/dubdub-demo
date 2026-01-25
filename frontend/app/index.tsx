import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const LOGO_URL = 'https://customer-assets.emergentagent.com/job_swipelearn-11/artifacts/wfuczij1_Screenshot%202026-01-25%20at%207.36.05%E2%80%AFPM.png';

export default function LoginScreen() {
  const { user, login, loading, setUser, setSessionToken } = useAuth();
  const router = useRouter();
  const [devLoading, setDevLoading] = useState(false);

  const navigateAfterLogin = (userData: any) => {
    // Check if user has completed onboarding
    if (!userData.onboarding_complete) {
      router.replace('/onboarding');
    } else {
      router.replace('/feed');
    }
  };

  const devLogin = async () => {
    try {
      setDevLoading(true);
      
      const response = await axios.post(`${BACKEND_URL}/api/auth/dev-login`);
      const { session_token, user: userData } = response.data;
      
      setSessionToken(session_token);
      
      const userResponse = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${session_token}` },
      });
      
      setUser(userResponse.data);
      navigateAfterLogin(userResponse.data);
    } catch (error) {
      console.error('Dev login error:', error);
      alert('Dev login failed');
    } finally {
      setDevLoading(false);
    }
  };

  useEffect(() => {
    if (user && !loading) {
      navigateAfterLogin(user);
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
          <Image 
            source={{ uri: LOGO_URL }} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Quick Plays. Real Wins.</Text>
        </View>

        <View style={styles.centerContent}>
          <Text style={styles.description}>
            30 second plays across topics you love.
          </Text>
        </View>

        <View style={styles.bottomContent}>
          {/* For demo: Google button uses devLogin instead of real Google login */}
          <TouchableOpacity style={styles.loginButton} onPress={devLogin} activeOpacity={0.8} disabled={devLoading}>
            <LinearGradient colors={['#00FF87', '#00D9FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.buttonGradient}>
              <Ionicons name="logo-google" size={24} color="#0F0F1E" style={styles.googleIcon} />
              <Text style={styles.loginButtonText}>{devLoading ? 'Logging in...' : 'Login with Google'}</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Dev Login - Hidden for demo */}
          {/* <TouchableOpacity style={styles.devButton} onPress={devLogin} activeOpacity={0.8} disabled={devLoading}>
            <Ionicons name="code" size={20} color="#00FF87" style={styles.devIcon} />
            <Text style={styles.devButtonText}>
              {devLoading ? 'Logging in...' : 'Dev Login (Quick Test)'}
            </Text>
          </TouchableOpacity> */}

          <Text style={styles.footerText}>Join the winners community</Text>
          <Text style={styles.versionText}>v1.3.0</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, justifyContent: 'space-between', alignItems: 'center', padding: 32, paddingTop: 80, paddingBottom: 50 },
  header: { alignItems: 'center' },
  logo: { width: 200, height: 200 },
  title: { fontSize: 72, fontWeight: '800', color: '#FFFFFF', marginTop: 20, letterSpacing: -2 },
  tagline: { fontSize: 20, fontWeight: '600', color: '#00FF87', marginTop: 8, textAlign: 'center', letterSpacing: 0.5 },
  centerContent: { alignItems: 'center', paddingHorizontal: 20 },
  description: { fontSize: 20, fontWeight: '600', color: '#00D9FF', textAlign: 'center', lineHeight: 28 },
  bottomContent: { width: '100%', alignItems: 'center' },
  loginButton: { width: '100%', borderRadius: 30, overflow: 'hidden', marginBottom: 12 },
  buttonGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, paddingHorizontal: 40 },
  googleIcon: { marginRight: 12 },
  loginButtonText: { fontSize: 18, fontWeight: '700', color: '#0F0F1E' },
  devButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 255, 135, 0.1)', borderWidth: 1, borderColor: '#00FF87', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 24, width: '100%' },
  devIcon: { marginRight: 8 },
  devButtonText: { fontSize: 14, fontWeight: '600', color: '#00FF87' },
  footerText: { fontSize: 14, fontWeight: '400', color: '#B0B0C8', marginTop: 20 },
  versionText: { fontSize: 12, fontWeight: '400', color: '#666', marginTop: 8, opacity: 0.6 },
});
