# 🎮 Invin App - Quick Reference Guide

## 📍 How to Access Scripts and MongoDB

### Option 1: Via Chat Interface (Easiest)
Just ask me (the AI agent) to run commands for you! For example:
- "Run the add content script"
- "Show me all playables in the database"
- "Reset my progress"

### Option 2: Direct Terminal Access (If Available)
If your Emergent workspace provides terminal/bash access, you can run:

```bash
# Add new content
python3 /app/add_content.py

# View all playables
python3 /app/add_content.py list

# Access MongoDB directly
mongosh $MONGO_URL
```

---

## 🔄 How to Reset Your Progress

### Method 1: Quick Python Script
Ask me to run this:
```python
from pymongo import MongoClient
import os

client = MongoClient(os.environ['MONGO_URL'])
db = client['test_database']

# Your email
user_email = "YOUR_EMAIL@gmail.com"

# Find user
user = db.users.find_one({"email": user_email})
if user:
    # Delete progress
    db.user_progress.delete_many({"user_id": user["user_id"]})
    # Reset stats
    db.users.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "total_played": 0,
            "correct_answers": 0,
            "current_streak": 0,
            "best_streak": 0
        }}
    )
    print("Progress reset!")
```

### Method 2: Via API (From Your Mobile App)
1. Get your session token from the app
2. Run this curl command:
```bash
curl -X DELETE "http://localhost:3000/api/admin/reset-progress" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

### Method 3: Ask Me!
Just say: "Reset my progress" and I'll do it for you!

---

## 📱 Version Checking

Look at the bottom of the login screen - you'll see the version number (e.g., v1.0.1)

**Current Version: v1.0.1**
- Fixed: Mobile crash on answer selection (runOnJS issue)
- Added: Version number display
- Added: Progress reset endpoints

---

## 🗄️ Database Access

### View Your Database Stats
```python
from pymongo import MongoClient
import os

client = MongoClient(os.environ['MONGO_URL'])
db = client['test_database']

print(f"Total playables: {db.playables.count_documents({})}")
print(f"Total users: {db.users.count_documents({})}")
print(f"Total progress entries: {db.user_progress.count_documents({})}")
```

### View All Playables
```python
playables = list(db.playables.find({}, {"_id": 0, "title": 1, "category": 1}))
for p in playables:
    print(f"- [{p['category']}] {p['title']}")
```

### Check Your Progress
```python
user_email = "YOUR_EMAIL@gmail.com"
user = db.users.find_one({"email": user_email})
if user:
    print(f"Total Played: {user['total_played']}")
    print(f"Correct: {user['correct_answers']}")
    print(f"Current Streak: {user['current_streak']}")
    print(f"Best Streak: {user['best_streak']}")
```

---

## 🛠️ Common Commands

### Add 10 New Questions Quickly
```bash
for i in {1..10}; do
  python3 /app/add_content.py << EOF
Question $i
General
easy
1
What is 2+2?
3
4
5
6
4
n
EOF
done
```

### View All Categories
```python
from pymongo import MongoClient
import os

client = MongoClient(os.environ['MONGO_URL'])
db = client['test_database']

categories = db.playables.distinct("category")
print("Categories:", categories)
```

### Delete a Playable
```python
db.playables.delete_one({"playable_id": "play_xxxxxxxxxxxxx"})
```

---

## 🐛 Troubleshooting

### App Still Crashing?
1. Check version number (should be v1.0.1)
2. Remove app from Expo Go completely
3. Close Expo Go app
4. Reopen and scan QR code again

### Not Seeing New Content?
1. Make sure content was added successfully
2. Your progress may have already answered those questions
3. Reset progress to see all questions again

### Can't Access MongoDB?
Ask me! I can run any MongoDB commands for you.

---

## 📞 Need Help?

Just ask in the chat! I can:
- Run scripts for you
- Query the database
- Reset your progress
- Add new content
- Fix any issues

Example: "Show me all the questions in the Science category"
