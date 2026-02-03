# DubDub API Documentation

---

## ⚠️ MAINTENANCE INSTRUCTIONS (For Developers & AI Agents)

**When adding NEW playable types/formats or modifying the API:**

1. **Update Backend Schema API** (`/app/backend/server.py`):
   - Add new type to `"enum"` in `playable_schema.required_fields.type`
   - Add new fields to `optional_fields` if applicable
   - Add example payload in `example_payloads` section
   - Update `/api/playable-types` endpoint
   - Increment `version` number

2. **Update this Documentation** (`/app/API_TEMPLATE.md`):
   - Add new type to "Valid Playable Types" table
   - Add example payload under "Add Playable" section
   - Update field reference tables if needed

3. **Files to Update Checklist**:
   - [ ] `/app/backend/server.py` - Schema API endpoint + playable-types endpoint
   - [ ] `/app/API_TEMPLATE.md` - This file
   - [ ] Frontend components if new rendering logic needed

---

## Base URL
- **Preview:** `https://your-app.preview.emergent.sh`
- **Production:** `https://your-app.emergent.host`

---

## Quick Reference Endpoints (No Auth Required)

### Get All Playable Types with Descriptions
```http
GET /api/playable-types
```

**Response:**
```json
{
  "types": [
    {
      "id": "text",
      "name": "Text",
      "description": "Text-only question",
      "supported_answer_types": ["mcq", "text_input"]
    },
    {
      "id": "guess_the_x",
      "name": "Guess the X",
      "description": "5 hints • Next hint revealed on wrong answer",
      "supported_answer_types": ["text_input"],
      "required_fields": ["hints"],
      "hints_count": "3-5"
    },
    {
      "id": "this_or_that",
      "name": "This or That",
      "description": "Two images • Tap to select the correct one",
      "supported_answer_types": ["tap_select"],
      "required_fields": ["image_left_url", "image_right_url", "label_left", "label_right"]
    }
    // ... more types
  ]
}
```

### Get API Schema
```http
GET /api/docs/schema
```
Returns full API documentation including all endpoints, field schemas, and example payloads.

---

## Authentication

### Admin Authentication
All admin endpoints require the `Authorization` header with a Bearer token.

```
Authorization: Bearer <admin_token>
```

#### Login to get Admin Token
```http
POST /api/admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "<admin_password>"
}
```

**Response:**
```json
{
  "token": "admin_xxxxxxxxxxxxx",
  "expires_in": "24 hours"
}
```

---

## Category APIs

### Get All Categories (Admin)
```http
GET /api/admin/categories
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "categories": [
    {
      "category_id": "cat_abc12345",
      "name": "SCIENCE",
      "icon": "flask",
      "color": "#4CAF50",
      "playable_count": 15
    }
  ],
  "count": 10
}
```

### Add Category
```http
POST /api/admin/categories
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "name": "ASTRONOMY",
  "icon": "planet",
  "color": "#3F51B5"
}
```

**Required Fields:**
| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Category name (will be displayed as-is) |

**Optional Fields:**
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `icon` | string | `"help-circle"` | Valid Ionicons name (see `/api/admin/valid-icons`) |
| `color` | string | `"#00FF87"` | Hex color code (#RGB or #RRGGBB) |

**Response:**
```json
{
  "success": true,
  "message": "Category 'ASTRONOMY' added successfully",
  "category_id": "cat_abc12345"
}
```

### Update Category (Icon/Color only)
```http
PATCH /api/admin/categories/{category_id}
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "icon": "rocket",
  "color": "#E91E63"
}
```

**Optional Fields (at least one required):**
| Field | Type | Description |
|-------|------|-------------|
| `icon` | string | Valid Ionicons name |
| `color` | string | Hex color code |

### Delete Category
```http
DELETE /api/admin/categories/{category_id}
Authorization: Bearer <admin_token>
```

**Note:** Cannot delete categories that have playables using them.

### Get Valid Icons
```http
GET /api/admin/valid-icons
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
  "icons": ["add", "airplane", "alert", "..."],
  "count": 276
}
```

---

## Playable APIs

### Get All Playables (Admin)
```http
GET /api/admin/playables
Authorization: Bearer <admin_token>
```

### Add Playable

```http
POST /api/admin/add-playable
Authorization: Bearer <admin_token>
Content-Type: application/json
```

#### IMPORTANT: Request uses FLAT fields, NOT nested objects

The API accepts flat fields which are internally converted to nested `question` object in the database.

| API Request Field | Stored In Database As |
|-------------------|----------------------|
| `question_text` | `question.text` |
| `video_url` | `question.video_url` |
| `image_url` | `question.image_url` or `question.image_base64` |

---

#### Type: Text Question (MCQ)
```json
{
  "type": "text",
  "answer_type": "mcq",
  "category": "SCIENCE",
  "title": "Chemistry Basics",
  "question_text": "What is the chemical symbol for Gold?",
  "options": ["Au", "Ag", "Fe", "Cu"],
  "correct_answer": "Au",
  "answer_explanation": "Au comes from the Latin word 'Aurum'",
  "difficulty": "easy"
}
```

#### Type: Text Question (Text Input)
```json
{
  "type": "text",
  "answer_type": "text_input",
  "category": "GEOGRAPHY",
  "title": "World Capitals",
  "question_text": "What is the capital of France?",
  "correct_answer": "Paris",
  "alternate_answers": ["paris", "PARIS"],
  "answer_explanation": "Paris has been the capital since 987 AD",
  "difficulty": "easy"
}
```

#### Type: Video Question
```json
{
  "type": "video",
  "answer_type": "mcq",
  "category": "MATHS",
  "title": "Math Puzzle",
  "question_text": "Solve this puzzle!",
  "video_url": "https://example.com/video.mp4",
  "options": ["7", "14", "10", "24"],
  "correct_answer": "7",
  "difficulty": "medium"
}
```

#### Type: Video with Start/End Time (YouTube Clips)
```json
{
  "type": "video",
  "answer_type": "mcq",
  "category": "SPORTS",
  "title": "Cricket Moment",
  "question_text": "Who hit this shot?",
  "video_url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "video_start": 30,
  "video_end": 45,
  "options": ["Sachin", "Virat", "Dhoni", "Rohit"],
  "correct_answer": "Dhoni",
  "difficulty": "medium"
}
```

#### Type: Image Question
```json
{
  "type": "image",
  "answer_type": "mcq",
  "category": "ART",
  "title": "Famous Paintings",
  "question_text": "Who painted this?",
  "image_url": "https://example.com/painting.jpg",
  "options": ["Da Vinci", "Picasso", "Van Gogh", "Monet"],
  "correct_answer": "Van Gogh",
  "difficulty": "medium"
}
```

#### Type: Guess the X (Progressive Hints)
```json
{
  "type": "guess_the_x",
  "answer_type": "text_input",
  "category": "MOVIES",
  "title": "Guess the Movie",
  "question_text": "Guess the movie from these hints",
  "hints": [
    "Released in 1994",
    "Based on a Stephen King novella",
    "Set in a prison",
    "Stars Tim Robbins and Morgan Freeman",
    "Hope is a good thing"
  ],
  "correct_answer": "The Shawshank Redemption",
  "alternate_answers": ["shawshank redemption", "shawshank"],
  "difficulty": "medium"
}
```

#### Type: Chess Mate in 2
```json
{
  "type": "chess_mate_in_2",
  "answer_type": "text_input",
  "category": "CHESS",
  "title": "Mate in 2",
  "question_text": "Find the winning sequence",
  "fen": "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
  "solution": ["h5f7"],
  "correct_answer": "h5f7",
  "difficulty": "hard"
}
```

#### Type: This or That (NEW)
```json
{
  "type": "this_or_that",
  "answer_type": "tap_select",
  "category": "SPORTS",
  "title": "Logo Challenge",
  "question_text": "Which is the Real Madrid logo?",
  "image_left_url": "https://example.com/real-madrid-logo.png",
  "image_right_url": "https://example.com/barcelona-logo.png",
  "label_left": "Real Madrid",
  "label_right": "Barcelona",
  "correct_answer": "Real Madrid",
  "answer_explanation": "Real Madrid is known for its white jersey",
  "difficulty": "easy"
}
```

**Required fields for this_or_that:**
| Field | Description |
|-------|-------------|
| `image_left_url` | URL of the left image |
| `image_right_url` | URL of the right image |
| `label_left` | Label for left image (used for answer matching, not shown to users) |
| `label_right` | Label for right image (used for answer matching, not shown to users) |
| `correct_answer` | Must match either `label_left` or `label_right` |

---

### Update Playable

```http
PUT /api/admin/playables/{playable_id}
Authorization: Bearer <admin_token>
Content-Type: application/json
```

**IMPORTANT:** Uses the same flat field structure as Add Playable. The `question` object is merged with existing data.

#### Example: Update Video URL
```json
{
  "type": "video",
  "answer_type": "mcq",
  "category": "MATHS",
  "title": "Be Careful",
  "question_text": "Solve This!",
  "video_url": "https://new-video-url.com/video.mp4",
  "correct_answer": "7",
  "difficulty": "medium",
  "options": ["14", "7", "10", "24"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Playable updated successfully",
  "playable_id": "play_xxxxx"
}
```

### Delete Playable
```http
DELETE /api/admin/playables/{playable_id}
Authorization: Bearer <admin_token>
```

---

## Field Reference

### Required Fields for All Playables
| Field | Type | Description |
|-------|------|-------------|
| `type` | string | One of: `text`, `image`, `video`, `image_text`, `video_text`, `guess_the_x`, `chess_mate_in_2` |
| `answer_type` | string | One of: `mcq`, `text_input` |
| `category` | string | Must match an existing category name |
| `title` | string | Display title for the playable |
| `correct_answer` | string | The correct answer |

### Optional Fields
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `question_text` | string | null | The question text |
| `video_url` | string | null | URL to video (MP4 or YouTube) |
| `video_start` | integer | null | Start time in seconds (YouTube only) |
| `video_end` | integer | null | End time in seconds (YouTube only) |
| `image_url` | string | null | URL to image or base64 data URL |
| `options` | array | null | 4 options for MCQ (required if answer_type is mcq) |
| `alternate_answers` | array | null | Alternative accepted answers for text_input |
| `answer_explanation` | string | null | Explanation shown after answering |
| `hints` | array | null | 3-5 progressive hints (for guess_the_x only) |
| `fen` | string | null | Chess position in FEN notation (for chess_mate_in_2 only) |
| `solution` | array | null | Chess moves in UCI format (for chess_mate_in_2 only) |
| `difficulty` | string | `"medium"` | One of: `easy`, `medium`, `hard` |

---

## User Management APIs

### Get All Users (Admin)
```http
GET /api/admin/users
Authorization: Bearer <admin_token>
```

### Reset User Progress (Admin)
```http
POST /api/admin/reset-user-progress
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "email": "user@example.com"
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "detail": "Invalid icon 'xyz'. Please use a valid Ionicons name."
}
```

### 401 Unauthorized
```json
{
  "detail": "Invalid admin token - session not found"
}
```

### 404 Not Found
```json
{
  "detail": "Playable not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Error message describing the issue"
}
```

---

## Common Mistakes to Avoid

### ❌ Wrong: Nested question object
```json
{
  "question": {
    "text": "What is 2+2?",
    "video_url": "https://..."
  }
}
```

### ✅ Correct: Flat fields
```json
{
  "question_text": "What is 2+2?",
  "video_url": "https://..."
}
```

---

### ❌ Wrong: Invalid icon name
```json
{
  "icon": "my-custom-icon"
}
```

### ✅ Correct: Valid Ionicons name
```json
{
  "icon": "rocket"
}
```

---

### ❌ Wrong: Category doesn't exist
```json
{
  "category": "NonExistentCategory"
}
```

### ✅ Correct: Use existing category (case-sensitive match)
```json
{
  "category": "SCIENCE"
}
```

---

## Valid Playable Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `text` | Text-only question | `question_text` |
| `image` | Image-based question | `image_url`, `question_text` (optional) |
| `video` | Video-based question | `video_url`, `question_text` (optional) |
| `image_text` | Image with text | `image_url`, `question_text` |
| `video_text` | Video with text | `video_url`, `question_text` |
| `guess_the_x` | Progressive hints game | `hints` (3-5 items), `question_text` |
| `chess_mate_in_2` | Chess puzzle | `fen`, `solution` |

---

## Sample Ionicons (Most Used)

**General:** `star`, `heart`, `flash`, `rocket`, `trophy`, `medal`, `ribbon`

**Categories:** `flask`, `globe`, `book`, `calculator`, `musical-notes`, `film`, `tv`

**Sports:** `football`, `basketball`, `baseball`, `tennisball`, `bicycle`, `fitness`

**Nature:** `leaf`, `flower`, `planet`, `sunny`, `moon`, `water`, `flame`

**Tech:** `hardware-chip`, `code`, `terminal`, `laptop`, `phone-portrait`

For full list, call `GET /api/admin/valid-icons`
