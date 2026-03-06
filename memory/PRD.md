# dubdub - Playable Feed Platform

## Product Overview
A mobile app (React Native/Expo) featuring a scrollable feed of quick, interactive playables across various categories. Users can test their knowledge through different formats including text questions, image-based questions, chess puzzles, and "Guess the X" games.

## Core Features

### Authentication
- Google Sign In (Emergent OAuth) - All platforms
- Apple Sign In (iOS only) - Required for App Store
- Multi-admin login support for dashboard

### Feed System
- Weight-based playable ranking (higher weight = shown first)
- App version-based content filtering (TYPE_MIN_VERSION)
- Set-based progression (5 questions per set)
- Streak tracking and gamification
- Skip functionality without affecting streak

### Playable Types
- `text` - Text-only questions with MCQ or text input
- `image_text` - Image + text questions
- `video_text` - Video + text questions
- `guess_the_x` - Progressive hint-based guessing
- `chess_mate_in_2` - Chess puzzles (Lichess format)
- `this_or_that` - Binary choice questions

### Category System (COMPLETED - March 2026)
- **Onboarding**: New users must select minimum 3 categories
- **Descriptions**: Optional descriptions per category (e.g., "Chess: Mate in 2 Puzzles")
- **Edit Preferences**: Users can edit categories anytime via Settings modal
- **Admin Support**: Admin APIs support adding/editing category descriptions

### Account Management
- User stats tracking (played, correct, streak, best streak)
- Account deletion (Apple compliance)
- Progress reset ("Play Again" feature)

## Technical Architecture

### Backend (FastAPI + MongoDB)
- `backend/server.py` - Main API server
- Collections: users, playables, categories, user_progress, user_sessions, admin_sessions

### Frontend (React Native + Expo Router)
- `frontend/app/index.tsx` - Login screen + routing
- `frontend/app/onboarding.tsx` - Category selection
- `frontend/app/feed.tsx` - Main feed with settings modal
- `frontend/components/` - Reusable components (PlayableCard, ChessPuzzleCard, FeedbackOverlay)
- `frontend/contexts/AuthContext.tsx` - Authentication context

### Key Models
```
User: {
  user_id, email, name, picture,
  total_played, correct_answers, current_streak, best_streak,
  selected_categories: List[str],
  onboarding_complete: bool,
  created_at
}

Category: {
  category_id, name, icon, color,
  description?: str,
  playable_count
}

Playable: {
  playable_id, type, answer_type, category,
  question, options, correct_answer, alternate_answers,
  answer_explanation, hints, difficulty, weight
}
```

## What's Been Implemented

### March 2026
- **Category Selection & Editing Feature** (COMPLETE)
  - New user onboarding flow with min 3 category selection
  - Category descriptions support (optional)
  - Pre-populated edit mode for existing users
  - "Edit Categories" option in Settings modal
  - Admin API updates for description management
  - Full test coverage (21/21 tests passed)

### Previous Implementations
- Playable versioning (type-based min_app_version)
- Account deletion flow (Apple compliance)
- Apple Sign In integration
- Chess puzzles (Lichess format)
- Completion time display
- React.memo optimizations
- Multi-admin support
- Title field removal from playables

## Pending Tasks

### P1 - High Priority
- Mixpanel Integration (awaiting credentials from user)

### P2 - Medium Priority
- Export stats to CSV/Excel from admin dashboard

### P3 - Low Priority
- Haptic feedback on correct/incorrect answers
- Graphs/charts for admin stats visualization

## Admin Credentials
- URL: `/admin`
- Users:
  - admin / @dm!n!spl@ying
  - meenal / M3en@ladmin

## Environment
- Backend: FastAPI on port 8001
- Frontend: Expo on port 3000
- Database: MongoDB (local via MONGO_URL env var)
- Preview URL: https://onboard-cats.preview.emergentagent.com
