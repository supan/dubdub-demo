#!/usr/bin/env python3
"""
Script to easily add new playable content to the Invin app database.

Usage:
    python3 add_content.py

This will guide you through adding a new playable question interactively.
"""

from pymongo import MongoClient
from datetime import datetime, timezone
import uuid
import os

def add_playable():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
    client = MongoClient(mongo_url)
    db = client['test_database']
    
    print("\n🎮 Add New Playable Content to Invin\n")
    print("=" * 50)
    
    # Get basic info
    print("\n📝 Basic Information:")
    title = input("Title: ")
    category = input("Category (e.g., Science, History, Math): ")
    difficulty = input("Difficulty (easy/medium/hard): ") or "medium"
    
    # Choose content type
    print("\n🎨 Content Type:")
    print("1. Text only")
    print("2. Image")
    print("3. Video")
    print("4. Image + Text")
    print("5. Video + Text")
    content_choice = input("Choose (1-5): ")
    
    type_map = {
        "1": "text",
        "2": "image",
        "3": "video",
        "4": "image_text",
        "5": "video_text"
    }
    playable_type = type_map.get(content_choice, "text")
    
    # Build question object
    question = {}
    
    if playable_type in ["text", "image_text", "video_text"]:
        question["text"] = input("\nQuestion text: ")
    
    if playable_type in ["image", "image_text"]:
        image_url = input("\nImage URL (from Unsplash, etc.): ")
        question["image_base64"] = image_url  # Actually stores URL now
    
    if playable_type in ["video", "video_text"]:
        video_url = input("\nVideo URL: ")
        question["video_url"] = video_url
    
    # Choose answer type
    print("\n✍️ Answer Type:")
    print("1. Multiple Choice (4 options)")
    print("2. Text Input")
    answer_choice = input("Choose (1-2): ")
    
    answer_type = "mcq" if answer_choice == "1" else "text_input"
    options = None
    
    if answer_type == "mcq":
        print("\nEnter 4 options:")
        options = [
            input("Option 1: "),
            input("Option 2: "),
            input("Option 3: "),
            input("Option 4: ")
        ]
    
    correct_answer = input("\nCorrect answer: ")
    
    # Create playable document
    playable = {
        "playable_id": f"play_{uuid.uuid4().hex[:12]}",
        "type": playable_type,
        "answer_type": answer_type,
        "category": category,
        "title": title,
        "question": question,
        "options": options,
        "correct_answer": correct_answer,
        "difficulty": difficulty,
        "created_at": datetime.now(timezone.utc)
    }
    
    # Insert into database
    db.playables.insert_one(playable)
    
    print("\n✅ Playable added successfully!")
    print(f"   ID: {playable['playable_id']}")
    print(f"   Type: {playable_type}")
    print(f"   Answer: {answer_type}")
    
    # Show current count
    total = db.playables.count_documents({})
    print(f"\n📊 Total playables in database: {total}")
    
    client.close()

def view_playables():
    """View all playables in the database"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/')
    client = MongoClient(mongo_url)
    db = client['test_database']
    
    playables = list(db.playables.find({}, {
        "_id": 0,
        "playable_id": 1,
        "title": 1,
        "category": 1,
        "type": 1,
        "answer_type": 1
    }))
    
    print("\n📚 All Playables:")
    print("=" * 70)
    for i, p in enumerate(playables, 1):
        print(f"{i}. [{p['category']}] {p['title']}")
        print(f"   Type: {p['type']} | Answer: {p['answer_type']}")
        print(f"   ID: {p['playable_id']}")
        print()
    
    print(f"Total: {len(playables)} playables")
    
    client.close()

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1 and sys.argv[1] == "list":
        view_playables()
    else:
        add_playable()
        
        # Ask if they want to add more
        another = input("\nAdd another playable? (y/n): ")
        while another.lower() == 'y':
            add_playable()
            another = input("\nAdd another playable? (y/n): ")
        
        print("\n👋 Done! Your new content is ready in the app.")
