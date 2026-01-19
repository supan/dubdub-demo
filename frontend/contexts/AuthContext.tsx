import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const SESSION_TOKEN_KEY = '@invin_session_token';

interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  total_played: number;
  correct_answers: number;
  current_streak: number;
  best_streak: number;
  selected_categories?: string[];
  onboarding_complete?: boolean;
}

interface AuthContextType {
  user: User | null;
  sessionToken: string | null;
  login: () => Promise<void>;
  logout: () => void;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setSessionToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

WebBrowser.maybeCompleteAuthSession();

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Handle deep link on cold start
        await handleInitialURL();
        
        // Check for existing session on mount
        await checkExistingSession();
      } catch (error) {
        console.error('Auth initialization error:', error);
        setLoading(false);
      }
    };
    
    initializeAuth();
    
    // Handle deep link when app is running
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    return () => {
      subscription.remove();
    };
  }, []);

  const handleInitialURL = async () => {
    const initialUrl = await Linking.getInitialURL();
    if (initialUrl) {
      processAuthURL(initialUrl);
    }
  };

  const handleDeepLink = (event: { url: string }) => {
    processAuthURL(event.url);
  };

  const processAuthURL = async (url: string) => {
    // Parse session_id from URL (support both # and ?)
    const sessionIdMatch = url.match(/[#?]session_id=([^&]+)/);
    
    if (sessionIdMatch) {
      const sessionId = sessionIdMatch[1];
      await exchangeSession(sessionId);
    }
  };

  const exchangeSession = async (sessionId: string) => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${BACKEND_URL}/api/auth/session`,
        {},
        {
          headers: {
            'X-Session-ID': sessionId,
          },
        }
      );

      const { session_token, user: userData } = response.data;
      
      // Save token to persistent storage
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, session_token);
      setSessionToken(session_token);
      
      // Fetch full user data
      const userResponse = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${session_token}`,
        },
      });
      
      setUser(userResponse.data);
    } catch (error) {
      console.error('Error exchanging session:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkExistingSession = async () => {
    try {
      // Restore token from persistent storage
      const storedToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
      
      if (storedToken) {
        // Verify the token is still valid by calling /api/auth/me
        try {
          const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          
          // Token is valid, restore the session
          setSessionToken(storedToken);
          setUser(response.data);
          console.log('Session restored successfully');
        } catch (error: any) {
          // Token is invalid or expired, clear it
          console.log('Stored token invalid, clearing...');
          await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
        }
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    try {
      setLoading(true);
      
      // Create redirect URL based on platform
      const redirectUrl = Platform.OS === 'web'
        ? `${BACKEND_URL}/`
        : Linking.createURL('/');
      
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      if (Platform.OS === 'web') {
        // For web, redirect directly
        window.location.href = authUrl;
      } else {
        // For mobile, use WebBrowser
        const result = await WebBrowser.openAuthSessionAsync(
          authUrl,
          redirectUrl
        );
        
        if (result.type === 'success' && result.url) {
          await processAuthURL(result.url);
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (sessionToken) {
        await axios.post(
          `${BACKEND_URL}/api/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear stored token
      await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
      setUser(null);
      setSessionToken(null);
    }
  };

  const refreshUser = async () => {
    if (!sessionToken) return;
    
    try {
      const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
      setUser(response.data);
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, sessionToken, login, logout, loading, refreshUser, setUser, setSessionToken }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
