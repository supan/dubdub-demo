import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import * as WebBrowser from 'expo-web-browser';
import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const SESSION_TOKEN_KEY = '@invin_session_token';

// Helper to safely get expo-linking (lazy loaded to avoid web issues)
const getExpoLinking = () => {
  if (Platform.OS === 'web') return null;
  try {
    return require('expo-linking');
  } catch (e) {
    console.log('expo-linking not available');
    return null;
  }
};

// Helper to safely get Apple Authentication (iOS only)
const getAppleAuth = () => {
  if (Platform.OS !== 'ios') return null;
  try {
    return require('expo-apple-authentication');
  } catch (e) {
    console.log('expo-apple-authentication not available:', e);
    return null;
  }
};

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
  loginWithApple: () => Promise<void>;
  isAppleAuthAvailable: boolean;
  logout: () => void;
  loading: boolean;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  setSessionToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Only call maybeCompleteAuthSession on native
if (Platform.OS !== 'web') {
  WebBrowser.maybeCompleteAuthSession();
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAppleAuthAvailable, setIsAppleAuthAvailable] = useState(false);

  // Check if Apple Auth is available (iOS only)
  useEffect(() => {
    const checkAppleAuth = async () => {
      if (Platform.OS === 'ios') {
        try {
          const AppleAuth = getAppleAuth();
          if (AppleAuth) {
            const available = await AppleAuth.isAvailableAsync();
            setIsAppleAuthAvailable(available);
          }
        } catch (e) {
          console.log('Error checking Apple Auth availability:', e);
          setIsAppleAuthAvailable(false);
        }
      }
    };
    checkAppleAuth();
  }, []);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Handle auth callback on web - check URL for session_id
        if (Platform.OS === 'web') {
          await handleWebAuthCallback();
        } else {
          // Handle deep link on cold start (native only)
          await handleInitialURL();
        }
        
        // Check for existing session on mount
        await checkExistingSession();
      } catch (error) {
        console.error('Auth initialization error:', error);
        setLoading(false);
      }
    };
    
    initializeAuth();
    
    // Handle deep link when app is running (native only)
    let subscription: { remove: () => void } | null = null;
    const Linking = getExpoLinking();
    if (Platform.OS !== 'web' && Linking) {
      try {
        subscription = Linking.addEventListener('url', handleDeepLink);
      } catch (e) {
        console.log('Could not add linking listener:', e);
      }
    }
    
    return () => {
      subscription?.remove();
    };
  }, []);

  const handleInitialURL = async () => {
    const Linking = getExpoLinking();
    if (Platform.OS === 'web' || !Linking) return;
    
    try {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        processAuthURL(initialUrl);
      }
    } catch (e) {
      console.log('Could not get initial URL:', e);
    }
  };

  // Handle auth callback on web - check current URL for session_id
  const handleWebAuthCallback = async () => {
    if (Platform.OS !== 'web') return;
    
    try {
      const currentUrl = window.location.href;
      console.log('Web auth callback check, URL:', currentUrl);
      
      // Check if URL contains session_id (from Emergent OAuth redirect)
      if (currentUrl.includes('session_id=')) {
        await processAuthURL(currentUrl);
        
        // Clean up URL by removing the session_id parameter
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {
      console.log('Web auth callback error:', e);
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
      let storedToken: string | null = null;
      try {
        storedToken = await AsyncStorage.getItem(SESSION_TOKEN_KEY);
      } catch (storageError) {
        console.log('Error reading from AsyncStorage:', storageError);
        // Clear potentially corrupted storage
        try {
          await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
        } catch (e) {
          // Ignore cleanup errors
        }
        setLoading(false);
        return;
      }
      
      if (storedToken) {
        // Verify the token is still valid by calling /api/auth/me
        try {
          const response = await axios.get(`${BACKEND_URL}/api/auth/me`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
            timeout: 10000, // 10 second timeout
          });
          
          // Token is valid, restore the session
          setSessionToken(storedToken);
          setUser(response.data);
          console.log('Session restored successfully');
        } catch (error: any) {
          // Token is invalid or expired, clear it
          console.log('Stored token invalid, clearing...');
          try {
            await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
          } catch (e) {
            // Ignore cleanup errors
          }
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
      let redirectUrl: string;
      if (Platform.OS === 'web') {
        // Use window.location.origin for web to work across all environments (preview, prod, custom domains)
        redirectUrl = typeof window !== 'undefined' ? window.location.origin + '/' : `${BACKEND_URL}/`;
      } else {
        const Linking = getExpoLinking();
        if (Linking) {
          // For native, use expo-linking
          try {
            redirectUrl = Linking.createURL('/');
          } catch (e) {
            // Fallback if linking context isn't available
            redirectUrl = 'invin:///';
          }
        } else {
          // Ultimate fallback
          redirectUrl = 'invin:///';
        }
      }
      
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

  // Apple Sign In (iOS only) - uses Emergent's auth service
  const loginWithApple = async () => {
    if (Platform.OS !== 'ios') {
      console.log('Apple Sign In is only available on iOS');
      return;
    }

    const AppleAuth = getAppleAuth();
    if (!AppleAuth) {
      console.log('Apple Authentication module not available');
      return;
    }

    try {
      setLoading(true);
      
      // Request Apple credentials
      const credential = await AppleAuth.signInAsync({
        requestedScopes: [
          AppleAuth.AppleAuthenticationScope.FULL_NAME,
          AppleAuth.AppleAuthenticationScope.EMAIL,
        ],
      });

      // Extract user info from Apple credential
      const { identityToken, user: appleUserId, email, fullName } = credential;
      
      if (!identityToken) {
        throw new Error('No identity token received from Apple');
      }

      // Build display name from Apple's fullName object
      let displayName = '';
      if (fullName) {
        const parts = [fullName.givenName, fullName.familyName].filter(Boolean);
        displayName = parts.join(' ');
      }

      // Send to backend for verification and session creation
      const response = await axios.post(`${BACKEND_URL}/api/auth/apple`, {
        identity_token: identityToken,
        apple_user_id: appleUserId,
        email: email || undefined,
        name: displayName || undefined,
      });

      const { session_token, user: userData } = response.data;
      
      // Store session and update state
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, session_token);
      setSessionToken(session_token);
      setUser(userData);
      
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        // User cancelled the sign-in
        console.log('Apple Sign In cancelled by user');
      } else {
        console.error('Apple Sign In error:', error);
      }
    } finally {
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

  // Helper to save token to both state and storage
  const saveSessionToken = async (token: string | null) => {
    if (token) {
      await AsyncStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      await AsyncStorage.removeItem(SESSION_TOKEN_KEY);
    }
    setSessionToken(token);
  };

  return (
    <AuthContext.Provider
      value={{ user, sessionToken, login, loginWithApple, isAppleAuthAvailable, logout, loading, refreshUser, setUser, setSessionToken: saveSessionToken }}
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
