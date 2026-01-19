import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ADMIN_TOKEN_KEY = 'invin_admin_token';

type ContentType = 'text' | 'image' | 'video' | 'image_text' | 'video_text';
type AnswerType = 'mcq' | 'text_input';

interface Playable {
  playable_id: string;
  type: string;
  answer_type: string;
  category: string;
  title: string;
  question: any;
  options?: string[];
  correct_answer: string;
  answer_explanation?: string;
  difficulty: string;
  created_at: string;
}

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminToken, setAdminToken] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Reset Progress State
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Add Content State
  const [contentType, setContentType] = useState<ContentType>('text');
  const [answerType, setAnswerType] = useState<AnswerType>('mcq');
  const [category, setCategory] = useState('');
  const [title, setTitle] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [alternateAnswers, setAlternateAnswers] = useState('');
  const [answerExplanation, setAnswerExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [addLoading, setAddLoading] = useState(false);
  const [addMessage, setAddMessage] = useState('');

  // Existing Content State
  const [playables, setPlayables] = useState<Playable[]>([]);
  const [loadingPlayables, setLoadingPlayables] = useState(false);
  const [activeTab, setActiveTab] = useState<'reset' | 'add' | 'bulk' | 'view' | 'stats'>('stats');

  // Bulk Upload State
  const [bulkFormatType, setBulkFormatType] = useState('text_mcq');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Stats State
  const [statsDate, setStatsDate] = useState(new Date().toISOString().split('T')[0]);
  const [statsData, setStatsData] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);

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
        
        // Store token for persistence
        try {
          await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
        } catch (e) {
          console.log('Could not store admin token');
        }
        
        // Fetch playables with the token directly (not from state)
        fetchPlayables(token);
      }
    } catch (error: any) {
      setLoginError(error.response?.data?.detail || 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  };

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const storedToken = await AsyncStorage.getItem(ADMIN_TOKEN_KEY);
        if (storedToken) {
          // Verify token is still valid
          const response = await axios.get(`${BACKEND_URL}/api/admin/playables`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          // If successful, restore session
          setAdminToken(storedToken);
          setIsLoggedIn(true);
          setPlayables(response.data.playables);
        }
      } catch (e) {
        // Token invalid, remove it
        await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
      }
    };
    checkExistingSession();
  }, []);

  const fetchPlayables = async (token: string) => {
    try {
      setLoadingPlayables(true);
      const response = await axios.get(`${BACKEND_URL}/api/admin/playables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPlayables(response.data.playables);
    } catch (error) {
      console.error('Error fetching playables:', error);
    } finally {
      setLoadingPlayables(false);
    }
  };

  const fetchStats = async (date?: string) => {
    try {
      setStatsLoading(true);
      const targetDate = date || statsDate;
      const response = await axios.get(`${BACKEND_URL}/api/admin/stats?date=${targetDate}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      setStatsData(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleDateChange = (newDate: string) => {
    setStatsDate(newDate);
    fetchStats(newDate);
  };

  const handleResetProgress = async () => {
    if (!resetEmail) {
      setResetMessage('Please enter an email address');
      return;
    }

    try {
      setResetLoading(true);
      setResetMessage('');

      const response = await axios.post(
        `${BACKEND_URL}/api/admin/reset-user-progress`,
        { email: resetEmail },
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      setResetMessage(`✅ ${response.data.message}`);
      setResetEmail('');
    } catch (error: any) {
      setResetMessage(`❌ ${error.response?.data?.detail || 'Failed to reset progress'}`);
    } finally {
      setResetLoading(false);
    }
  };

  const handleAddContent = async () => {
    // Validation
    if (!category || !title || !correctAnswer) {
      setAddMessage('❌ Please fill in category, title, and correct answer');
      return;
    }

    if ((contentType === 'text' || contentType === 'image_text' || contentType === 'video_text') && !questionText) {
      setAddMessage('❌ Please enter question text');
      return;
    }

    if ((contentType === 'image' || contentType === 'image_text') && !imageUrl) {
      setAddMessage('❌ Please enter image URL');
      return;
    }

    if ((contentType === 'video' || contentType === 'video_text') && !videoUrl) {
      setAddMessage('❌ Please enter video URL');
      return;
    }

    if (answerType === 'mcq') {
      const filledOptions = options.filter(o => o.trim());
      if (filledOptions.length < 2) {
        setAddMessage('❌ Please fill at least 2 options for MCQ');
        return;
      }
      if (!filledOptions.includes(correctAnswer)) {
        setAddMessage('❌ Correct answer must be one of the options');
        return;
      }
    }

    try {
      setAddLoading(true);
      setAddMessage('');

      const payload: any = {
        type: contentType,
        answer_type: answerType,
        category,
        title,
        correct_answer: correctAnswer,
        answer_explanation: answerExplanation || undefined,
        difficulty,
      };

      if (questionText) payload.question_text = questionText;
      if (imageUrl) payload.image_url = imageUrl;
      if (videoUrl) payload.video_url = videoUrl;
      if (answerType === 'mcq') {
        payload.options = options.filter(o => o.trim());
      }

      const response = await axios.post(
        `${BACKEND_URL}/api/admin/add-playable`,
        payload,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );

      setAddMessage(`✅ ${response.data.message} (ID: ${response.data.playable_id})`);
      
      // Reset form
      setCategory('');
      setTitle('');
      setQuestionText('');
      setImageUrl('');
      setVideoUrl('');
      setOptions(['', '', '', '']);
      setCorrectAnswer('');
      setAnswerExplanation('');
      
      // Refresh playables list
      if (adminToken) fetchPlayables(adminToken);
    } catch (error: any) {
      setAddMessage(`❌ ${error.response?.data?.detail || 'Failed to add content'}`);
    } finally {
      setAddLoading(false);
    }
  };

  const handleDeletePlayable = async (playableId: string) => {
    if (Platform.OS === 'web') {
      if (!window.confirm('Are you sure you want to delete this playable?')) return;
    }

    try {
      await axios.delete(`${BACKEND_URL}/api/admin/playables/${playableId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      
      // Refresh list
      if (adminToken) fetchPlayables(adminToken);
    } catch (error) {
      console.error('Error deleting playable:', error);
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
  };

  // Login Screen
  if (!isLoggedIn) {
    return (
      <LinearGradient colors={['#1a1a2e', '#16213e', '#0f3460']} style={styles.container}>
        <ScrollView contentContainerStyle={styles.loginContainer}>
          <View style={styles.loginCard}>
            <Ionicons name="shield-checkmark" size={60} color="#00FF87" />
            <Text style={styles.loginTitle}>Admin Dashboard</Text>
            <Text style={styles.loginSubtitle}>Invin Content Management</Text>

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

            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              <LinearGradient
                colors={['#00FF87', '#00D9FF']}
                style={styles.loginButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => {
            setIsLoggedIn(false);
            setAdminToken(null);
          }}
        >
          <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'stats' && styles.tabActive]}
          onPress={() => { setActiveTab('stats'); fetchStats(); }}
        >
          <Ionicons name="stats-chart" size={18} color={activeTab === 'stats' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'stats' && styles.tabTextActive]}>Stats</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reset' && styles.tabActive]}
          onPress={() => setActiveTab('reset')}
        >
          <Ionicons name="refresh" size={18} color={activeTab === 'reset' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'reset' && styles.tabTextActive]}>Reset</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'add' && styles.tabActive]}
          onPress={() => setActiveTab('add')}
        >
          <Ionicons name="add-circle" size={18} color={activeTab === 'add' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'add' && styles.tabTextActive]}>Add</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'bulk' && styles.tabActive]}
          onPress={() => setActiveTab('bulk')}
        >
          <Ionicons name="cloud-upload" size={18} color={activeTab === 'bulk' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'bulk' && styles.tabTextActive]}>Bulk</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'view' && styles.tabActive]}
          onPress={() => setActiveTab('view')}
        >
          <Ionicons name="list" size={18} color={activeTab === 'view' ? '#00FF87' : '#888'} />
          <Text style={[styles.tabText, activeTab === 'view' && styles.tabTextActive]}>View</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats Tab */}
        {activeTab === 'stats' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>User Performance Stats</Text>
            <Text style={styles.sectionDescription}>
              View user performance metrics for a specific date.
            </Text>

            {/* Date Picker */}
            <View style={styles.datePickerRow}>
              <Text style={styles.dateLabel}>Select Date:</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={statsDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  style={{
                    backgroundColor: '#1E1E2E',
                    color: '#FFF',
                    border: '1px solid #333',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                  }}
                />
              ) : (
                <TextInput
                  style={styles.dateInput}
                  value={statsDate}
                  onChangeText={handleDateChange}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#666"
                />
              )}
              <TouchableOpacity style={styles.refreshBtn} onPress={() => fetchStats()}>
                <Ionicons name="refresh" size={20} color="#00FF87" />
              </TouchableOpacity>
            </View>

            {statsLoading ? (
              <ActivityIndicator size="large" color="#00FF87" style={{ marginTop: 20 }} />
            ) : statsData ? (
              <View style={styles.statsContainer}>
                {/* Summary Cards */}
                <View style={styles.summaryRow}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{statsData.summary.active_users}</Text>
                    <Text style={styles.summaryLabel}>Active Users</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{statsData.summary.total_played}</Text>
                    <Text style={styles.summaryLabel}>Total Played</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{statsData.summary.total_correct}</Text>
                    <Text style={styles.summaryLabel}>Correct</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: '#00FF87' }]}>
                      {statsData.summary.overall_accuracy}%
                    </Text>
                    <Text style={styles.summaryLabel}>Accuracy</Text>
                  </View>
                </View>

                {/* User Table */}
                <View style={styles.tableContainer}>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderCell, { flex: 2 }]}>User</Text>
                    <Text style={styles.tableHeaderCell}>Played</Text>
                    <Text style={styles.tableHeaderCell}>Correct</Text>
                    <Text style={styles.tableHeaderCell}>Accuracy</Text>
                    <Text style={styles.tableHeaderCell}>Streak</Text>
                  </View>
                  {statsData.user_stats.map((user: any, index: number) => (
                    <View key={user.user_id} style={[styles.tableRow, index % 2 === 0 && styles.tableRowAlt]}>
                      <View style={{ flex: 2 }}>
                        <Text style={styles.tableCell} numberOfLines={1}>{user.name}</Text>
                        <Text style={styles.tableCellSmall} numberOfLines={1}>{user.email}</Text>
                      </View>
                      <Text style={styles.tableCell}>{user.played}</Text>
                      <Text style={styles.tableCell}>{user.correct}</Text>
                      <Text style={[styles.tableCell, { color: user.accuracy >= 70 ? '#00FF87' : user.accuracy >= 40 ? '#FFB800' : '#FF6B6B' }]}>
                        {user.accuracy}%
                      </Text>
                      <Text style={styles.tableCell}>{user.current_streak}🔥</Text>
                    </View>
                  ))}
                  {statsData.user_stats.length === 0 && (
                    <Text style={styles.noDataText}>No user activity on this date</Text>
                  )}
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.loadStatsBtn} onPress={() => fetchStats()}>
                <Text style={styles.loadStatsBtnText}>Load Stats</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Reset Progress Tab */}
        {activeTab === 'reset' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reset User Progress</Text>
            <Text style={styles.sectionDescription}>
              Enter the email address of the user whose progress you want to reset.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="User email address"
              placeholderTextColor="#666"
              value={resetEmail}
              onChangeText={setResetEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            {resetMessage ? (
              <Text style={[styles.message, resetMessage.includes('❌') && styles.errorMessage]}>
                {resetMessage}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleResetProgress}
              disabled={resetLoading}
            >
              <LinearGradient
                colors={['#FF6B6B', '#FF8E53']}
                style={styles.actionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {resetLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={20} color="#FFF" />
                    <Text style={styles.actionButtonText}>Reset Progress</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Add Content Tab */}
        {activeTab === 'add' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Add New Content</Text>

            {/* Content Type Selector */}
            <Text style={styles.label}>Content Type</Text>
            <View style={styles.typeSelector}>
              {(['text', 'image', 'video', 'image_text', 'video_text'] as ContentType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeOption, contentType === type && styles.typeOptionSelected]}
                  onPress={() => setContentType(type)}
                >
                  <Text style={[styles.typeOptionText, contentType === type && styles.typeOptionTextSelected]}>
                    {type.replace('_', ' + ').toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Answer Type Selector */}
            <Text style={styles.label}>Answer Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[styles.typeOption, answerType === 'mcq' && styles.typeOptionSelected]}
                onPress={() => setAnswerType('mcq')}
              >
                <Text style={[styles.typeOptionText, answerType === 'mcq' && styles.typeOptionTextSelected]}>
                  MCQ (Multiple Choice)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeOption, answerType === 'text_input' && styles.typeOptionSelected]}
                onPress={() => setAnswerType('text_input')}
              >
                <Text style={[styles.typeOptionText, answerType === 'text_input' && styles.typeOptionTextSelected]}>
                  Text Input
                </Text>
              </TouchableOpacity>
            </View>

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Science, History, Geography"
              placeholderTextColor="#666"
              value={category}
              onChangeText={setCategory}
            />

            {/* Title */}
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Question title"
              placeholderTextColor="#666"
              value={title}
              onChangeText={setTitle}
            />

            {/* Question Text (for text-based types) */}
            {(contentType === 'text' || contentType === 'image_text' || contentType === 'video_text') && (
              <>
                <Text style={styles.label}>Question Text</Text>
                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  placeholder="Enter the question"
                  placeholderTextColor="#666"
                  value={questionText}
                  onChangeText={setQuestionText}
                  multiline
                  numberOfLines={3}
                />
              </>
            )}

            {/* Image URL */}
            {(contentType === 'image' || contentType === 'image_text') && (
              <>
                <Text style={styles.label}>Image URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://example.com/image.jpg"
                  placeholderTextColor="#666"
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  autoCapitalize="none"
                />
              </>
            )}

            {/* Video URL */}
            {(contentType === 'video' || contentType === 'video_text') && (
              <>
                <Text style={styles.label}>Video URL</Text>
                <TextInput
                  style={styles.input}
                  placeholder="https://example.com/video.mp4"
                  placeholderTextColor="#666"
                  value={videoUrl}
                  onChangeText={setVideoUrl}
                  autoCapitalize="none"
                />
              </>
            )}

            {/* MCQ Options */}
            {answerType === 'mcq' && (
              <>
                <Text style={styles.label}>Options (at least 2)</Text>
                {options.map((option, index) => (
                  <TextInput
                    key={index}
                    style={styles.input}
                    placeholder={`Option ${index + 1}`}
                    placeholderTextColor="#666"
                    value={option}
                    onChangeText={(value) => updateOption(index, value)}
                  />
                ))}
              </>
            )}

            {/* Correct Answer */}
            <Text style={styles.label}>Correct Answer</Text>
            <TextInput
              style={styles.input}
              placeholder={answerType === 'mcq' ? 'Must match one of the options' : 'Expected answer'}
              placeholderTextColor="#666"
              value={correctAnswer}
              onChangeText={setCorrectAnswer}
            />

            {/* Answer Explanation */}
            <Text style={styles.label}>Answer Explanation (Optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Brief explanation shown after answering (e.g., 'Carbon dioxide is released during photosynthesis...')"
              placeholderTextColor="#666"
              value={answerExplanation}
              onChangeText={setAnswerExplanation}
              multiline
              numberOfLines={3}
            />

            {/* Difficulty */}
            <Text style={styles.label}>Difficulty</Text>
            <View style={styles.typeSelector}>
              {['easy', 'medium', 'hard'].map((diff) => (
                <TouchableOpacity
                  key={diff}
                  style={[styles.typeOption, difficulty === diff && styles.typeOptionSelected]}
                  onPress={() => setDifficulty(diff)}
                >
                  <Text style={[styles.typeOptionText, difficulty === diff && styles.typeOptionTextSelected]}>
                    {diff.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {addMessage ? (
              <Text style={[styles.message, addMessage.includes('❌') && styles.errorMessage]}>
                {addMessage}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleAddContent}
              disabled={addLoading}
            >
              <LinearGradient
                colors={['#00FF87', '#00D9FF']}
                style={styles.actionButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {addLoading ? (
                  <ActivityIndicator color="#0F0F1E" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color="#0F0F1E" />
                    <Text style={[styles.actionButtonText, { color: '#0F0F1E' }]}>Add Content</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Bulk Upload Tab */}
        {activeTab === 'bulk' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bulk Upload Content</Text>
            <Text style={styles.sectionDescription}>
              Upload multiple questions at once using Excel (.xlsx) or CSV files.
            </Text>

            {/* Step 1: Download Template */}
            <View style={styles.bulkStep}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <Text style={styles.stepTitle}>Download Sample Template</Text>
              </View>
              
              <Text style={styles.label}>Select Format Type</Text>
              <View style={styles.typeSelector}>
                {[
                  { id: 'text_mcq', name: 'Text + MCQ' },
                  { id: 'text_input', name: 'Text + Input' },
                  { id: 'image_mcq', name: 'Image + MCQ' },
                  { id: 'image_text_input', name: 'Image + Input' },
                  { id: 'video_mcq', name: 'Video + MCQ' },
                  { id: 'video_text_input', name: 'Video + Input' },
                ].map((format) => (
                  <TouchableOpacity
                    key={format.id}
                    style={[styles.typeOption, bulkFormatType === format.id && styles.typeOptionSelected]}
                    onPress={() => setBulkFormatType(format.id)}
                  >
                    <Text style={[styles.typeOptionText, bulkFormatType === format.id && styles.typeOptionTextSelected]}>
                      {format.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.downloadButtons}>
                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => {
                    const url = `${BACKEND_URL}/api/admin/template/${bulkFormatType}?file_format=xlsx`;
                    if (Platform.OS === 'web') {
                      // For web, create a temporary link and click it
                      const link = document.createElement('a');
                      link.href = url;
                      link.setAttribute('download', `template_${bulkFormatType}.xlsx`);
                      // Add auth header via fetch
                      fetch(url, {
                        headers: { Authorization: `Bearer ${adminToken}` }
                      })
                        .then(res => res.blob())
                        .then(blob => {
                          const blobUrl = window.URL.createObjectURL(blob);
                          link.href = blobUrl;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        });
                    }
                  }}
                >
                  <Ionicons name="download" size={18} color="#00FF87" />
                  <Text style={styles.downloadButtonText}>Excel (.xlsx)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.downloadButton}
                  onPress={() => {
                    const url = `${BACKEND_URL}/api/admin/template/${bulkFormatType}?file_format=csv`;
                    if (Platform.OS === 'web') {
                      fetch(url, {
                        headers: { Authorization: `Bearer ${adminToken}` }
                      })
                        .then(res => res.blob())
                        .then(blob => {
                          const blobUrl = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = blobUrl;
                          link.setAttribute('download', `template_${bulkFormatType}.csv`);
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        });
                    }
                  }}
                >
                  <Ionicons name="download" size={18} color="#00FF87" />
                  <Text style={styles.downloadButtonText}>CSV (.csv)</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Step 2: Upload File */}
            <View style={styles.bulkStep}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <Text style={styles.stepTitle}>Upload Your File</Text>
              </View>

              {Platform.OS === 'web' ? (
                <View style={styles.uploadArea}>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={(e: any) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedFile(file);
                        setBulkResult(null);
                      }
                    }}
                    style={{ display: 'none' }}
                    id="bulk-file-input"
                  />
                  <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={() => {
                      (document.getElementById('bulk-file-input') as HTMLInputElement)?.click();
                    }}
                  >
                    <Ionicons name="cloud-upload" size={32} color="#00FF87" />
                    <Text style={styles.uploadButtonText}>
                      {selectedFile ? selectedFile.name : 'Click to select file'}
                    </Text>
                    <Text style={styles.uploadHint}>Supports .xlsx, .xls, .csv</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadArea}>
                  <Text style={styles.mobileNote}>
                    Bulk upload is best used on desktop/web browser.{'\n'}
                    Visit the admin dashboard URL in your browser.
                  </Text>
                </View>
              )}

              {selectedFile && (
                <TouchableOpacity
                  style={styles.processButton}
                  onPress={async () => {
                    if (!selectedFile || !adminToken) return;
                    
                    setBulkUploading(true);
                    setBulkResult(null);
                    
                    try {
                      const formData = new FormData();
                      formData.append('file', selectedFile);
                      
                      const response = await axios.post(
                        `${BACKEND_URL}/api/admin/bulk-upload?format_type=${bulkFormatType}`,
                        formData,
                        {
                          headers: {
                            Authorization: `Bearer ${adminToken}`,
                            'Content-Type': 'multipart/form-data',
                          },
                        }
                      );
                      
                      setBulkResult(response.data);
                      
                      // Refresh playables list
                      if (adminToken) fetchPlayables(adminToken);
                    } catch (error: any) {
                      setBulkResult({
                        success: false,
                        error: error.response?.data?.detail || 'Upload failed'
                      });
                    } finally {
                      setBulkUploading(false);
                    }
                  }}
                  disabled={bulkUploading}
                >
                  <LinearGradient
                    colors={['#00FF87', '#00D9FF']}
                    style={styles.processButtonGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {bulkUploading ? (
                      <ActivityIndicator color="#0F0F1E" />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload" size={20} color="#0F0F1E" />
                        <Text style={styles.processButtonText}>Process & Upload</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              )}
            </View>

            {/* Upload Results */}
            {bulkResult && (
              <View style={[styles.bulkResult, !bulkResult.success && styles.bulkResultError]}>
                {bulkResult.success ? (
                  <>
                    <View style={styles.resultHeader}>
                      <Ionicons name="checkmark-circle" size={24} color="#00FF87" />
                      <Text style={styles.resultTitle}>Upload Complete!</Text>
                    </View>
                    <View style={styles.resultStats}>
                      <View style={styles.resultStat}>
                        <Text style={styles.resultStatValue}>{bulkResult.total_rows}</Text>
                        <Text style={styles.resultStatLabel}>Total Rows</Text>
                      </View>
                      <View style={styles.resultStat}>
                        <Text style={[styles.resultStatValue, { color: '#00FF87' }]}>{bulkResult.created_count}</Text>
                        <Text style={styles.resultStatLabel}>Created</Text>
                      </View>
                      <View style={styles.resultStat}>
                        <Text style={[styles.resultStatValue, { color: '#FF6B6B' }]}>{bulkResult.error_count}</Text>
                        <Text style={styles.resultStatLabel}>Errors</Text>
                      </View>
                    </View>
                    {bulkResult.errors && bulkResult.errors.length > 0 && (
                      <View style={styles.errorList}>
                        <Text style={styles.errorListTitle}>Errors:</Text>
                        {bulkResult.errors.slice(0, 5).map((err: string, idx: number) => (
                          <Text key={idx} style={styles.errorListItem}>• {err}</Text>
                        ))}
                        {bulkResult.errors.length > 5 && (
                          <Text style={styles.errorListItem}>... and {bulkResult.errors.length - 5} more</Text>
                        )}
                      </View>
                    )}
                  </>
                ) : (
                  <View style={styles.resultHeader}>
                    <Ionicons name="close-circle" size={24} color="#FF6B6B" />
                    <Text style={[styles.resultTitle, { color: '#FF6B6B' }]}>
                      {bulkResult.error || 'Upload Failed'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Instructions */}
            <View style={styles.instructions}>
              <Text style={styles.instructionsTitle}>How it works:</Text>
              <Text style={styles.instructionItem}>1. Select the format type that matches your content</Text>
              <Text style={styles.instructionItem}>2. Download the sample template (Excel or CSV)</Text>
              <Text style={styles.instructionItem}>3. Fill in your questions following the sample format</Text>
              <Text style={styles.instructionItem}>4. Upload your completed file</Text>
              <Text style={styles.instructionItem}>5. Review the results and fix any errors</Text>
            </View>
          </View>
        )}

        {/* View Content Tab */}
        {activeTab === 'view' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Existing Content ({playables.length})</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={() => adminToken && fetchPlayables(adminToken)}
              >
                <Ionicons name="refresh" size={20} color="#00FF87" />
              </TouchableOpacity>
            </View>

            {loadingPlayables ? (
              <ActivityIndicator size="large" color="#00FF87" style={{ marginTop: 20 }} />
            ) : (
              playables.map((playable) => (
                <View key={playable.playable_id} style={styles.playableCard}>
                  <View style={styles.playableHeader}>
                    <View style={styles.playableBadges}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{playable.category}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeType]}>
                        <Text style={styles.badgeText}>{playable.type}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeAnswer]}>
                        <Text style={styles.badgeText}>{playable.answer_type}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeletePlayable(playable.playable_id)}
                    >
                      <Ionicons name="trash" size={18} color="#FF6B6B" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.playableTitle}>{playable.title}</Text>
                  {playable.question.text && (
                    <Text style={styles.playableQuestion} numberOfLines={2}>
                      {playable.question.text}
                    </Text>
                  )}
                  <Text style={styles.playableAnswer}>
                    Answer: {playable.correct_answer}
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100%',
  },
  loginCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
    marginBottom: 24,
  },
  errorBox: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 8,
    padding: 12,
    width: '100%',
    marginBottom: 16,
  },
  errorText: {
    color: '#FF6B6B',
    textAlign: 'center',
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#FFFFFF',
    width: '100%',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  loginButton: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  loginButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  logoutButton: {
    padding: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(0, 255, 135, 0.15)',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
  },
  tabTextActive: {
    color: '#00FF87',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
    marginTop: 8,
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  typeOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  typeOptionSelected: {
    backgroundColor: 'rgba(0, 255, 135, 0.2)',
    borderColor: '#00FF87',
  },
  typeOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
  },
  typeOptionTextSelected: {
    color: '#00FF87',
  },
  message: {
    fontSize: 14,
    color: '#00FF87',
    marginVertical: 12,
    textAlign: 'center',
  },
  errorMessage: {
    color: '#FF6B6B',
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 16,
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshButton: {
    padding: 8,
  },
  playableCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  playableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  playableBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flex: 1,
  },
  badge: {
    backgroundColor: 'rgba(0, 255, 135, 0.2)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  badgeType: {
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
  },
  badgeAnswer: {
    backgroundColor: 'rgba(255, 142, 83, 0.2)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  deleteButton: {
    padding: 4,
  },
  playableTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  playableQuestion: {
    fontSize: 14,
    color: '#888',
    marginBottom: 8,
  },
  playableAnswer: {
    fontSize: 12,
    color: '#00FF87',
  },
  // Bulk Upload Styles
  bulkStep: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#00FF87',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  downloadButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  downloadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    borderWidth: 1,
    borderColor: '#00FF87',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  downloadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00FF87',
  },
  uploadArea: {
    marginTop: 8,
  },
  uploadButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  uploadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  uploadHint: {
    fontSize: 12,
    color: '#888',
  },
  mobileNote: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 22,
    padding: 20,
  },
  processButton: {
    marginTop: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  processButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  processButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F0F1E',
  },
  bulkResult: {
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    borderWidth: 1,
    borderColor: '#00FF87',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  bulkResultError: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderColor: '#FF6B6B',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00FF87',
  },
  resultStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    padding: 16,
  },
  resultStat: {
    alignItems: 'center',
  },
  resultStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultStatLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  errorList: {
    marginTop: 12,
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 8,
    padding: 12,
  },
  errorListTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 8,
  },
  errorListItem: {
    fontSize: 12,
    color: '#FF6B6B',
    marginBottom: 4,
  },
  instructions: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  instructionItem: {
    fontSize: 13,
    color: '#888',
    marginBottom: 8,
    lineHeight: 20,
  },
  // Stats styles
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  dateLabel: {
    fontSize: 14,
    color: '#888',
  },
  dateInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 10,
    color: '#FFFFFF',
    minWidth: 140,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  refreshBtn: {
    padding: 8,
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    borderRadius: 8,
  },
  statsContainer: {
    marginTop: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  summaryCard: {
    flex: 1,
    minWidth: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#888',
    marginTop: 4,
    textAlign: 'center',
  },
  tableContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#888',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  tableCell: {
    flex: 1,
    fontSize: 13,
    color: '#FFFFFF',
  },
  tableCellSmall: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  noDataText: {
    padding: 20,
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
  loadStatsBtn: {
    backgroundColor: 'rgba(0, 255, 135, 0.1)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  loadStatsBtnText: {
    color: '#00FF87',
    fontSize: 14,
    fontWeight: '600',
  },
});
