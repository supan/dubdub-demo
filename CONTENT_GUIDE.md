# 📝 Adding Content to Invin

There are 3 ways to add new playable content to your Invin app:

## Method 1: Interactive Python Script (Easiest) ⭐

Run the interactive script:

```bash
python3 /app/add_content.py
```

This will guide you through:
- Setting title, category, and difficulty
- Choosing content type (text, image, video, combinations)
- Choosing answer type (MCQ or text input)
- Entering the correct answer

To view all playables:
```bash
python3 /app/add_content.py list
```

---

## Method 2: Using the API Endpoints

### Add a Single Playable

```bash
curl -X POST "http://localhost:3000/api/admin/add-playable" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "answer_type": "mcq",
    "category": "General Knowledge",
    "title": "Capital of France",
    "question": {"text": "What is the capital of France?"},
    "options": ["London", "Paris", "Berlin", "Madrid"],
    "correct_answer": "Paris",
    "difficulty": "easy"
  }'
```

### View All Playables

```bash
curl "http://localhost:3000/api/admin/playables" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Reset Your Progress (for testing)

```bash
curl -X DELETE "http://localhost:3000/api/admin/reset-progress" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

---

## Method 3: Direct Database Access

```python
from pymongo import MongoClient
from datetime import datetime, timezone
import uuid
import os

mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
client = MongoClient(mongo_url)
db = client['test_database']

playable = {
    "playable_id": f"play_{uuid.uuid4().hex[:12]}",
    "type": "text",  # text, image, video, image_text, video_text
    "answer_type": "mcq",  # mcq or text_input
    "category": "Science",
    "title": "Your Question Title",
    "question": {
        "text": "Your question text here",
        # Optional: "image_base64": "https://image-url.com/image.jpg",
        # Optional: "video_url": "https://video-url.com/video.mp4"
    },
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],  # For MCQ only
    "correct_answer": "Option 2",
    "difficulty": "easy",  # easy, medium, hard
    "created_at": datetime.now(timezone.utc)
}

db.playables.insert_one(playable)
client.close()
```

---

## Content Format Guide

### Supported Types:
1. **text** - Text question only
2. **image** - Image with question text
3. **video** - Video with question text
4. **image_text** - Image + text question
5. **video_text** - Video + text question

### Answer Types:
1. **mcq** - Multiple choice (4 options)
2. **text_input** - Free text answer

### Question Object Structure:

```json
{
  "text": "Question text (optional for pure video/image)",
  "image_base64": "https://image-url.com/photo.jpg",  // For image types
  "video_url": "https://video-url.com/video.mp4"      // For video types
}
```

### Image URLs:
Use services like:
- Unsplash: `https://images.unsplash.com/photo-ID?w=400&h=300&fit=crop`
- Any public image URL

### Video URLs:
- Direct MP4 links
- Can use: `https://www.w3schools.com/html/mov_bbb.mp4` for testing

---

## Example Playables

### Text + MCQ
```json
{
  "type": "text",
  "answer_type": "mcq",
  "category": "History",
  "title": "American Independence",
  "question": {"text": "In what year did the USA gain independence?"},
  "options": ["1776", "1783", "1789", "1791"],
  "correct_answer": "1776",
  "difficulty": "easy"
}
```

### Image + Text Input
```json
{
  "type": "image",
  "answer_type": "text_input",
  "category": "Geography",
  "title": "Famous Landmarks",
  "question": {
    "image_base64": "https://images.unsplash.com/photo-ID",
    "text": "Name this landmark"
  },
  "options": null,
  "correct_answer": "Big Ben",
  "difficulty": "medium"
}
```

### Video + MCQ
```json
{
  "type": "video",
  "answer_type": "mcq",
  "category": "Science",
  "title": "Physics Concepts",
  "question": {
    "video_url": "https://example.com/video.mp4",
    "text": "What concept is demonstrated?"
  },
  "options": ["Gravity", "Magnetism", "Friction", "Inertia"],
  "correct_answer": "Gravity",
  "difficulty": "medium"
}
```

---

## Tips

1. **Categories**: Use consistent categories (Science, History, Math, etc.)
2. **Difficulty**: Balance easy, medium, and hard questions
3. **Images**: Use high-quality images from Unsplash or similar
4. **Videos**: Keep videos short (under 30 seconds) for better UX
5. **Answers**: For text_input, keep correct answers simple and lowercase-friendly

---

## Current Database Stats

Check your content:
```bash
python3 /app/add_content.py list
```

Or use MongoDB directly:
```python
from pymongo import MongoClient
import os

client = MongoClient(os.environ.get('MONGO_URL'))
db = client['test_database']

total = db.playables.count_documents({})
print(f"Total playables: {total}")
```
