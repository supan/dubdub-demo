import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_TOKEN_KEY = 'invin_admin_token';

interface Playable {
  playable_id: string;
  type: string;
  category: string;
  question: any;
  correct_answer: string;
  created_at?: string;
}

interface Category {
  category_id: string;
  name: string;
  icon: string;
  color: string;
  playable_count: number;
  description?: string;
}

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Playables State with Pagination
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [loadingPlayables, setLoadingPlayables] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayables, setTotalPlayables] = useState(0);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  // Available filter options
  const PLAYABLE_TYPES = [
    { value: '', label: 'All Types' },
    { value: 'text', label: 'Text' },
    { value: 'image_text', label: 'Image' },
    { value: 'video_text', label: 'Video' },
    { value: 'guess_the_x', label: 'Guess the X' },
    { value: 'chess_mate_in_2', label: 'Chess Puzzle' },
    { value: 'this_or_that', label: 'This or That' },
    { value: 'wordle', label: 'Wordle' },
  ];

  // Categories State
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState('');

  // UI State
  const [activeTab, setActiveTab] = useState('view');

  const handleLogin = async () => {
    if (!username || !password) {
      setLoginError('Please enter username and password');
      return;
    }
    try {
      setLoginLoading(true);
      setLoginError('');
      const response = await axios.post(`${BACKEND_URL}/api/admin/login`, {
        username,
        password,
      });
      if (response.data.success) {
        const token = response.data.token;
        setAdminToken(token);
        setIsLoggedIn(true);
        await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
        fetchPlayables(token, 1);
        fetchCategories(token);
      }
    } catch (error: any) {
      setLoginError(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
        if (storedToken) {
          const response = await axios.get(`${BACKEND_URL}/api/admin/playables?limit=1`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          setAdminToken(storedToken);
          setIsLoggedIn(true);
          fetchPlayables(storedToken, 1);
          fetchCategories(storedToken);
        }
      } catch (e) {
        await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    };
    checkExistingSession();
  }, []);

  const fetchPlayables = async (token: string, page: number, category?: string, type?: string) => {
    try {
      setLoadingPlayables(true);
      let url = `${BACKEND_URL}/api/admin/playables?page=${page}&limit=50`;
      if (category) url += `&category=${encodeURIComponent(category)}`;
      if (type) url += `&type=${encodeURIComponent(type)}`;
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      setPlayables(response.data.playables);
      setCurrentPage(response.data.page);
      setTotalPages(response.data.total_pages);
      setTotalPlayables(response.data.total);
    } catch (error) {
      console.error('Error fetching playables:', error);
    } finally {
      setLoadingPlayables(false);
    }
  };

  const fetchCategories = async (token: string) => {
    try {
      setLoadingCategories(true);
      const response = await axios.get(`${BACKEND_URL}/api/admin/categories`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleInitCategories = async () => {
    try {
      setCategoryMessage('Initializing...');
      const response = await axios.post(
        `${BACKEND_URL}/api/admin/categories/init`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      setCategoryMessage(`✅ ${response.data.message}`);
      if (adminToken) fetchCategories(adminToken);
    } catch (error: any) {
      setCategoryMessage(`❌ ${error.response?.data?.detail || 'Failed'}`);
    }
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && adminToken) {
      fetchPlayables(adminToken, newPage, filterCategory, filterType);
    }
  };

  const handleFilter = () => {
    if (adminToken) {
      fetchPlayables(adminToken, 1, filterCategory, filterType);
    }
  };

  const handleDeletePlayable = async (playableId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Delete this playable?')) return;
    }
    try {
      await axios.delete(`${BACKEND_URL}/api/admin/playables/${playableId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (adminToken) fetchPlayables(adminToken, currentPage, filterCategory, filterType);
    } catch (error) {
      console.error('Error deleting playable:', error);
    }
  };

  const handleLogout = async () => {
    setIsLoggedIn(false);
    setAdminToken(null);
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.loginCard}>
            <Ionicons name="shield-checkmark" size={60} color="#00FF87" />
            <Text style={styles.loginTitle}>Admin Dashboard</Text>
            <Text style={styles.loginSubtitle}>dubdub Content Management</Text>
            
            {loginError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{loginError}</Text>
              </View>
            ) : null}
            
            <TextInput
              style={styles.input}
              placeholder="Username"
              placeholderTextColor="#666"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            
            <TouchableOpacity style={styles.loginButton} onPress={handleLogin} disabled={loginLoading}>
              <LinearGradient colors={['#00FF87', '#00D9FF']} style={styles.loginButtonGradient}>
                {loginLoading ? (
                  <ActivityIndicator color="#0F0F1E" />
                ) : (
                  <Text style={styles.loginButtonText}>Login</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Admin Dashboard
  return (
    <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'view' && styles.tabActive]}
          onPress={() => setActiveTab('view')}
        >
          <Ionicons name="list" size={18} color={activeTab === 'view' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'view' && styles.tabTextActive]}>
            View Content
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'categories' && styles.tabActive]}
          onPress={() => setActiveTab('categories')}
        >
          <Ionicons name="pricetags" size={18} color={activeTab === 'categories' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'categories' && styles.tabTextActive]}>
            Categories
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'view' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Playables ({totalPlayables} total)
            </Text>

            {/* Filters */}
            <View style={styles.filterRow}>
              {/* Category Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => {
                    setShowCategoryDropdown(!showCategoryDropdown);
                    setShowTypeDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownText}>
                    {filterCategory || 'All Categories'}
                  </Text>
                  <Ionicons 
                    name={showCategoryDropdown ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color="#888" 
                  />
                </TouchableOpacity>
                {showCategoryDropdown && (
                  <View style={styles.dropdownMenu}>
                    <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                      <TouchableOpacity
                        style={styles.dropdownItem}
                        onPress={() => {
                          setFilterCategory('');
                          setShowCategoryDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, !filterCategory && styles.dropdownItemSelected]}>
                          All Categories
                        </Text>
                      </TouchableOpacity>
                      {categories.map((cat) => (
                        <TouchableOpacity
                          key={cat.category_id}
                          style={styles.dropdownItem}
                          onPress={() => {
                            setFilterCategory(cat.name);
                            setShowCategoryDropdown(false);
                          }}
                        >
                          <Ionicons name={cat.icon as any} size={16} color={cat.color} style={{ marginRight: 8 }} />
                          <Text style={[styles.dropdownItemText, filterCategory === cat.name && styles.dropdownItemSelected]}>
                            {cat.name} ({cat.playable_count})
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Type Dropdown */}
              <View style={styles.dropdownContainer}>
                <TouchableOpacity 
                  style={styles.dropdown}
                  onPress={() => {
                    setShowTypeDropdown(!showTypeDropdown);
                    setShowCategoryDropdown(false);
                  }}
                >
                  <Text style={styles.dropdownText}>
                    {PLAYABLE_TYPES.find(t => t.value === filterType)?.label || 'All Types'}
                  </Text>
                  <Ionicons 
                    name={showTypeDropdown ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color="#888" 
                  />
                </TouchableOpacity>
                {showTypeDropdown && (
                  <View style={styles.dropdownMenu}>
                    {PLAYABLE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setFilterType(type.value);
                          setShowTypeDropdown(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, filterType === type.value && styles.dropdownItemSelected]}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Apply Filter Button */}
              <TouchableOpacity style={styles.filterButton} onPress={handleFilter}>
                <Ionicons name="search" size={18} color="#0F0F1E" />
                <Text style={styles.filterButtonText}>Apply</Text>
              </TouchableOpacity>

              {/* Clear Filter Button */}
              {(filterCategory || filterType) && (
                <TouchableOpacity 
                  style={styles.clearButton} 
                  onPress={() => {
                    setFilterCategory('');
                    setFilterType('');
                    if (adminToken) fetchPlayables(adminToken, 1, '', '');
                  }}
                >
                  <Ionicons name="close-circle" size={18} color="#FF6B6B" />
                </TouchableOpacity>
              )}
            </View>

            {/* Pagination Controls */}
            <View style={styles.paginationContainer}>
              <TouchableOpacity
                style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                onPress={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#444' : '#00FF87'} />
              </TouchableOpacity>
              
              <Text style={styles.pageInfo}>
                Page {currentPage} of {totalPages}
              </Text>
              
              <TouchableOpacity
                style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                onPress={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? '#444' : '#00FF87'} />
              </TouchableOpacity>
            </View>

            {loadingPlayables ? (
              <ActivityIndicator size="large" color="#00FF87" style={{ marginTop: 20 }} />
            ) : (
              playables.map((playable) => (
                <View key={playable.playable_id} style={styles.playableCard}>
                  <View style={styles.playableHeader}>
                    <Text style={styles.playableType}>{playable.type}</Text>
                    <Text style={styles.playableCategory}>{playable.category}</Text>
                  </View>
                  <Text style={styles.playableQuestion} numberOfLines={2}>
                    {playable.question?.text || playable.question?.hint || 'No text'}
                  </Text>
                  <Text style={styles.playableAnswer}>
                    Answer: {playable.correct_answer}
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeletePlayable(playable.playable_id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF6B6B" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Bottom Pagination */}
            {playables.length > 0 && (
              <View style={styles.paginationContainer}>
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                  onPress={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#444' : '#00FF87'} />
                </TouchableOpacity>
                
                <Text style={styles.pageInfo}>
                  Page {currentPage} of {totalPages}
                </Text>
                
                <TouchableOpacity
                  style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]}
                  onPress={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? '#444' : '#00FF87'} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'categories' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categories ({categories.length})</Text>
            
            <TouchableOpacity style={styles.initButton} onPress={handleInitCategories}>
              <Text style={styles.initButtonText}>Initialize Categories from Playables</Text>
            </TouchableOpacity>
            
            {categoryMessage ? (
              <Text style={styles.messageText}>{categoryMessage}</Text>
            ) : null}

            {loadingCategories ? (
              <ActivityIndicator size="large" color="#00FF87" style={{ marginTop: 20 }} />
            ) : (
              categories.map((cat) => (
                <View key={cat.category_id} style={styles.categoryCard}>
                  <Ionicons name={cat.icon as any} size={24} color={cat.color} />
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Text style={styles.categoryCount}>{cat.playable_count} playables</Text>
                    {cat.description && (
                      <Text style={styles.categoryDesc}>{cat.description}</Text>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loginContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loginCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  loginTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 15,
  },
  loginSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: 'rgba(255,107,107,0.2)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
    width: '100%',
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 15,
    color: '#fff',
    marginBottom: 12,
    width: '100%',
  },
  loginButton: {
    width: '100%',
    marginTop: 10,
  },
  loginButtonGradient: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#0F0F1E',
    fontWeight: 'bold',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  logoutButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  tabActive: {
    backgroundColor: 'rgba(0,255,135,0.15)',
  },
  tabText: {
    color: '#888',
    marginLeft: 6,
    fontSize: 14,
  },
  tabTextActive: {
    color: '#00FF87',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 15,
    flexWrap: 'wrap',
    gap: 10,
  },
  filterInput: {
    flex: 1,
    minWidth: 120,
    marginBottom: 0,
  },
  filterButton: {
    backgroundColor: '#00FF87',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterButtonText: {
    color: '#0F0F1E',
    fontWeight: 'bold',
  },
  clearButton: {
    backgroundColor: 'rgba(255,107,107,0.2)',
    padding: 12,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropdownContainer: {
    flex: 1,
    minWidth: 150,
    position: 'relative',
    zIndex: 10,
  },
  dropdown: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: {
    color: '#fff',
    fontSize: 14,
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#1a1a2e',
    borderRadius: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 100,
    maxHeight: 250,
    overflow: 'hidden',
  },
  dropdownItem: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemText: {
    color: '#ccc',
    fontSize: 14,
  },
  dropdownItemSelected: {
    color: '#00FF87',
    fontWeight: 'bold',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 15,
    gap: 15,
  },
  pageButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    padding: 10,
    borderRadius: 8,
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageInfo: {
    color: '#fff',
    fontSize: 14,
  },
  playableCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    position: 'relative',
  },
  playableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playableType: {
    color: '#00FF87',
    fontSize: 12,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  playableCategory: {
    color: '#00D9FF',
    fontSize: 12,
  },
  playableQuestion: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 5,
  },
  playableAnswer: {
    color: '#888',
    fontSize: 12,
  },
  deleteButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    padding: 5,
  },
  initButton: {
    backgroundColor: 'rgba(0,255,135,0.2)',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 15,
  },
  initButtonText: {
    color: '#00FF87',
    fontWeight: 'bold',
  },
  messageText: {
    color: '#fff',
    marginBottom: 15,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  categoryInfo: {
    marginLeft: 15,
    flex: 1,
  },
  categoryName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  categoryCount: {
    color: '#888',
    fontSize: 12,
  },
  categoryDesc: {
    color: '#666',
    fontSize: 12,
    marginTop: 4,
  },
});
