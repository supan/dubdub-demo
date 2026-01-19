from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Response, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    total_played: int = 0
    correct_answers: int = 0
    current_streak: int = 0
    best_streak: int = 0
    selected_categories: Optional[List[str]] = None  # User's selected categories
    onboarding_complete: bool = False  # Whether user has completed category selection
    created_at: datetime

class SessionDataResponse(BaseModel):
    id: str
    email: str
    name: str
    picture: str
    session_token: str

class Playable(BaseModel):
    playable_id: str
    type: str  # "video", "image", "text", "video_text", "image_text", "chess"
    answer_type: str  # "mcq", "text_input"
    category: str
    title: str
    question: Dict[str, Any]  # {text?, video_url?, image_base64?}
    options: Optional[List[str]] = None  # For MCQ
    correct_answer: str
    answer_explanation: Optional[str] = None  # Brief explanation of the answer
    difficulty: str = "medium"
    created_at: datetime

class AnswerSubmission(BaseModel):
    answer: str

class UserProgress(BaseModel):
    user_id: str
    playable_id: str
    answered: bool
    correct: bool
    timestamp: datetime

class Category(BaseModel):
    category_id: str
    name: str
    icon: str  # Icon name (e.g., 'flask', 'globe', 'book')
    color: str  # Hex color for the category
    playable_count: int = 0

class CategorySelectionRequest(BaseModel):
    categories: List[str]  # List of category names

# ==================== AUTH HELPERS ====================

async def get_current_user_from_token(authorization: Optional[str] = Header(None)) -> Optional[User]:
    """Get user from Authorization header token"""
    if not authorization:
        return None
    
    try:
        # Remove "Bearer " prefix if present
        session_token = authorization.replace("Bearer ", "")
        
        # Find session
        session = await db.user_sessions.find_one(
            {"session_token": session_token},
            {"_id": 0}
        )
        
        if not session:
            return None
        
        # Check if session is expired
        expires_at = session["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        
        if expires_at < datetime.now(timezone.utc):
            return None
        
        # Get user
        user_doc = await db.users.find_one(
            {"user_id": session["user_id"]},
            {"_id": 0}
        )
        
        if user_doc:
            return User(**user_doc)
        
        return None
    except Exception as e:
        logging.error(f"Error getting current user: {e}")
        return None

async def require_auth(authorization: Optional[str] = Header(None)) -> User:
    """Require authentication"""
    user = await get_current_user_from_token(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/dev-login")
async def dev_login():
    """Development login - bypasses OAuth for testing"""
    try:
        # Hardcoded dev user
        dev_email = "supanshah51191@gmail.com"
        
        # Find or create user
        user_doc = await db.users.find_one({"email": dev_email}, {"_id": 0})
        
        if not user_doc:
            # Create dev user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            new_user = {
                "user_id": user_id,
                "email": dev_email,
                "name": "Dev User",
                "picture": None,
                "total_played": 0,
                "correct_answers": 0,
                "current_streak": 0,
                "best_streak": 0,
                "selected_categories": None,
                "onboarding_complete": False,
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(new_user)
            user_id_to_use = user_id
        else:
            user_id_to_use = user_doc["user_id"]
        
        # Create session
        dev_session_token = f"dev_session_{uuid.uuid4().hex}"
        session_doc = {
            "user_id": user_id_to_use,
            "session_token": dev_session_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=180),
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        return {
            "session_token": dev_session_token,
            "user": {
                "user_id": user_id_to_use,
                "email": dev_email,
                "name": "Dev User"
            }
        }
    
    except Exception as e:
        logging.error(f"Dev login error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/auth/session")
async def exchange_session(request: Request, response: Response):
    """Exchange session_id for session_token"""
    try:
        # Get session_id from header
        session_id = request.headers.get("X-Session-ID")
        
        if not session_id:
            raise HTTPException(status_code=400, detail="X-Session-ID header required")
        
        # Call Emergent Auth API
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": session_id},
                timeout=10.0
            )
            
            if auth_response.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session")
            
            user_data = auth_response.json()
        
        # Create SessionDataResponse
        session_data = SessionDataResponse(**user_data)
        
        # Check if user exists
        existing_user = await db.users.find_one(
            {"email": session_data.email},
            {"_id": 0}
        )
        
        if not existing_user:
            # Create new user
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            new_user = {
                "user_id": user_id,
                "email": session_data.email,
                "name": session_data.name,
                "picture": session_data.picture,
                "total_played": 0,
                "correct_answers": 0,
                "current_streak": 0,
                "best_streak": 0,
                "selected_categories": None,
                "onboarding_complete": False,
                "created_at": datetime.now(timezone.utc)
            }
            await db.users.insert_one(new_user)
            user_id_to_use = user_id
        else:
            user_id_to_use = existing_user["user_id"]
        
        # Store session in database
        session_doc = {
            "user_id": user_id_to_use,
            "session_token": session_data.session_token,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=180),
            "created_at": datetime.now(timezone.utc)
        }
        await db.user_sessions.insert_one(session_doc)
        
        # Return session data
        return {
            "session_token": session_data.session_token,
            "user": {
                "user_id": user_id_to_use,
                "email": session_data.email,
                "name": session_data.name,
                "picture": session_data.picture
            }
        }
    
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Auth service timeout")
    except Exception as e:
        logging.error(f"Session exchange error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/auth/me")
async def get_me(current_user: User = Depends(require_auth)):
    """Get current user info"""
    return current_user

@api_router.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    """Logout user"""
    if not authorization:
        raise HTTPException(status_code=400, detail="No authorization header")
    
    session_token = authorization.replace("Bearer ", "")
    
    # Delete session
    await db.user_sessions.delete_one({"session_token": session_token})
    
    return {"message": "Logged out successfully"}

# ==================== CATEGORY ENDPOINTS ====================

# Default category icons and colors mapping
CATEGORY_STYLES = {
    "SCIENCE": {"icon": "flask", "color": "#4CAF50"},
    "GEOGRAPHY": {"icon": "globe", "color": "#2196F3"},
    "HISTORY": {"icon": "time", "color": "#FF9800"},
    "LITERATURE": {"icon": "book", "color": "#9C27B0"},
    "SPORTS": {"icon": "football", "color": "#F44336"},
    "MUSIC": {"icon": "musical-notes", "color": "#E91E63"},
    "ART": {"icon": "color-palette", "color": "#00BCD4"},
    "MOVIES": {"icon": "film", "color": "#795548"},
    "TECHNOLOGY": {"icon": "hardware-chip", "color": "#607D8B"},
    "FOOD": {"icon": "restaurant", "color": "#FF5722"},
    "NATURE": {"icon": "leaf", "color": "#8BC34A"},
    "ANIMALS": {"icon": "paw", "color": "#FFEB3B"},
    "MATHEMATICS": {"icon": "calculator", "color": "#3F51B5"},
    "LANGUAGES": {"icon": "language", "color": "#009688"},
    "GENERAL": {"icon": "help-circle", "color": "#9E9E9E"},
}

def get_category_style(category_name: str) -> dict:
    """Get icon and color for a category"""
    upper_name = category_name.upper()
    if upper_name in CATEGORY_STYLES:
        return CATEGORY_STYLES[upper_name]
    # Default style for unknown categories
    return {"icon": "help-circle", "color": "#00FF87"}

@api_router.get("/categories")
async def get_categories(current_user: User = Depends(require_auth)):
    """Get all available categories with their counts, icons, and colors"""
    try:
        # Get distinct categories from playables
        pipeline = [
            {"$group": {"_id": "$category", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        
        category_counts = await db.playables.aggregate(pipeline).to_list(100)
        
        categories = []
        for cat in category_counts:
            cat_name = cat["_id"]
            style = get_category_style(cat_name)
            categories.append({
                "category_id": cat_name.lower().replace(" ", "_"),
                "name": cat_name,
                "icon": style["icon"],
                "color": style["color"],
                "playable_count": cat["count"]
            })
        
        return {"categories": categories}
    except Exception as e:
        logging.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/categories/select")
async def select_categories(
    request: CategorySelectionRequest,
    current_user: User = Depends(require_auth)
):
    """Save user's selected categories (minimum 3 required)"""
    try:
        if len(request.categories) < 3:
            raise HTTPException(
                status_code=400, 
                detail="Please select at least 3 categories"
            )
        
        # Update user with selected categories
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {
                "selected_categories": request.categories,
                "onboarding_complete": True
            }}
        )
        
        return {
            "success": True,
            "message": "Categories saved successfully",
            "selected_categories": request.categories
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error saving categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== PLAYABLE ENDPOINTS ====================

@api_router.get("/playables/feed")
async def get_playables_feed(
    skip: int = 0,
    limit: int = 10,
    current_user: User = Depends(require_auth)
):
    """Get playables feed"""
    try:
        # Get user's answered playables
        answered_playables = await db.user_progress.find(
            {"user_id": current_user.user_id},
            {"_id": 0, "playable_id": 1}
        ).to_list(1000)
        
        answered_ids = [p["playable_id"] for p in answered_playables]
        
        # Build query - filter by selected categories if user has them
        query = {}
        if answered_ids:
            query["playable_id"] = {"$nin": answered_ids}
        
        # Filter by user's selected categories if they have completed onboarding
        if current_user.selected_categories and len(current_user.selected_categories) > 0:
            query["category"] = {"$in": current_user.selected_categories}
        
        playables = await db.playables.find(query, {"_id": 0}).skip(skip).limit(limit).to_list(limit)
        
        return playables
    except Exception as e:
        logging.error(f"Error fetching playables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/playables/{playable_id}/answer")
async def submit_answer(
    playable_id: str,
    submission: AnswerSubmission,
    current_user: User = Depends(require_auth)
):
    """Submit answer for a playable"""
    try:
        # Get playable
        playable = await db.playables.find_one(
            {"playable_id": playable_id},
            {"_id": 0}
        )
        
        if not playable:
            raise HTTPException(status_code=404, detail="Playable not found")
        
        # Check answer
        is_correct = submission.answer.strip().lower() == playable["correct_answer"].strip().lower()
        
        # Save progress
        progress = {
            "user_id": current_user.user_id,
            "playable_id": playable_id,
            "answered": True,
            "correct": is_correct,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.user_progress.insert_one(progress)
        
        # Update user stats
        user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
        
        new_total_played = user_doc["total_played"] + 1
        new_correct_answers = user_doc["correct_answers"] + (1 if is_correct else 0)
        
        if is_correct:
            new_current_streak = user_doc["current_streak"] + 1
            new_best_streak = max(user_doc["best_streak"], new_current_streak)
        else:
            new_current_streak = 0
            new_best_streak = user_doc["best_streak"]
        
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {
                "total_played": new_total_played,
                "correct_answers": new_correct_answers,
                "current_streak": new_current_streak,
                "best_streak": new_best_streak
            }}
        )
        
        return {
            "correct": is_correct,
            "correct_answer": playable["correct_answer"],
            "answer_explanation": playable.get("answer_explanation"),
            "current_streak": new_current_streak,
            "best_streak": new_best_streak,
            "total_played": new_total_played,
            "correct_answers": new_correct_answers
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error submitting answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/user/stats")
async def get_user_stats(current_user: User = Depends(require_auth)):
    """Get user statistics"""
    return {
        "total_played": current_user.total_played,
        "correct_answers": current_user.correct_answers,
        "current_streak": current_user.current_streak,
        "best_streak": current_user.best_streak,
        "skipped": getattr(current_user, 'skipped', 0)
    }

@api_router.post("/playables/{playable_id}/skip")
async def skip_playable(
    playable_id: str,
    current_user: User = Depends(require_auth)
):
    """Skip a playable without affecting streak"""
    try:
        # Get playable to verify it exists
        playable = await db.playables.find_one(
            {"playable_id": playable_id},
            {"_id": 0}
        )
        
        if not playable:
            raise HTTPException(status_code=404, detail="Playable not found")
        
        # Save progress as skipped (so it doesn't appear again)
        progress = {
            "user_id": current_user.user_id,
            "playable_id": playable_id,
            "answered": False,
            "skipped": True,
            "correct": False,
            "timestamp": datetime.now(timezone.utc)
        }
        await db.user_progress.insert_one(progress)
        
        # Update user's skipped count (streak stays the same)
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$inc": {"skipped": 1}}
        )
        
        # Get updated user stats
        user_doc = await db.users.find_one({"user_id": current_user.user_id}, {"_id": 0})
        
        return {
            "skipped": True,
            "playable_id": playable_id,
            "current_streak": user_doc.get("current_streak", 0),
            "total_skipped": user_doc.get("skipped", 1)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error skipping playable: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== SEED DATA ====================

@api_router.post("/seed")
async def seed_data():
    """Seed database with sample playables"""
    try:
        # Check if already seeded
        count = await db.playables.count_documents({})
        if count > 0:
            return {"message": "Database already seeded", "count": count}
        
        playables = [
            # Video + MCQ
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "video",
                "answer_type": "mcq",
                "category": "Science",
                "title": "How does photosynthesis work?",
                "question": {
                    "video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
                    "text": "What is the primary gas absorbed during photosynthesis?"
                },
                "options": ["Oxygen", "Carbon Dioxide", "Nitrogen", "Hydrogen"],
                "correct_answer": "Carbon Dioxide",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Text + MCQ
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "text",
                "answer_type": "mcq",
                "category": "History",
                "title": "World War II",
                "question": {
                    "text": "In which year did World War II end?"
                },
                "options": ["1943", "1944", "1945", "1946"],
                "correct_answer": "1945",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Image + Text Input
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "image",
                "answer_type": "text_input",
                "category": "Geography",
                "title": "World Capitals",
                "question": {
                    "image_base64": "https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=400&h=300&fit=crop",
                    "text": "Which city is this landmark located in?"
                },
                "options": None,
                "correct_answer": "Paris",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Video + Text + MCQ
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "video_text",
                "answer_type": "mcq",
                "category": "Technology",
                "title": "Programming Basics",
                "question": {
                    "video_url": "https://www.w3schools.com/html/movie.mp4",
                    "text": "What does HTML stand for?"
                },
                "options": ["Hyper Text Markup Language", "High Tech Modern Language", "Home Tool Markup Language", "Hyperlinks and Text Markup Language"],
                "correct_answer": "Hyper Text Markup Language",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Image + Text + MCQ
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "image_text",
                "answer_type": "mcq",
                "category": "Math",
                "title": "Basic Arithmetic",
                "question": {
                    "image_base64": "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI0ZGRjdFRCIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjYwIiBmaWxsPSIjMzMzIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+NSArIDcgPSA/PC90ZXh0Pjwvc3ZnPg==",
                    "text": "What is the answer to this equation?"
                },
                "options": ["10", "11", "12", "13"],
                "correct_answer": "12",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Text + Text Input
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "text",
                "answer_type": "text_input",
                "category": "Literature",
                "title": "Famous Authors",
                "question": {
                    "text": "Who wrote 'Romeo and Juliet'?"
                },
                "options": None,
                "correct_answer": "Shakespeare",
                "difficulty": "easy",
                "created_at": datetime.now(timezone.utc)
            },
            # Video + Text Input
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "video",
                "answer_type": "text_input",
                "category": "Music",
                "title": "Musical Instruments",
                "question": {
                    "video_url": "https://www.w3schools.com/html/mov_bbb.mp4",
                    "text": "What instrument family does the piano belong to?"
                },
                "options": None,
                "correct_answer": "Percussion",
                "difficulty": "medium",
                "created_at": datetime.now(timezone.utc)
            },
            # Image + Text + Text Input
            {
                "playable_id": f"play_{uuid.uuid4().hex[:12]}",
                "type": "image_text",
                "answer_type": "text_input",
                "category": "Art",
                "title": "Famous Paintings",
                "question": {
                    "image_base64": "https://images.unsplash.com/photo-1574870111867-089730e5a72b?w=400&h=300&fit=crop",
                    "text": "Who painted this famous artwork?"
                },
                "options": None,
                "correct_answer": "Leonardo da Vinci",
                "difficulty": "medium",
                "created_at": datetime.now(timezone.utc)
            }
        ]
        
        await db.playables.insert_many(playables)
        
        return {"message": "Database seeded successfully", "count": len(playables)}
    
    except Exception as e:
        logging.error(f"Error seeding data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/user/reset-progress")
async def reset_user_progress(current_user: User = Depends(require_auth)):
    """Reset current user's progress (for testing)"""
    try:
        # Delete user's progress
        await db.user_progress.delete_many({"user_id": current_user.user_id})
        
        # Reset user stats
        await db.users.update_one(
            {"user_id": current_user.user_id},
            {"$set": {
                "total_played": 0,
                "correct_answers": 0,
                "current_streak": 0,
                "best_streak": 0
            }}
        )
        
        return {"message": "Progress reset successfully"}
    
    except Exception as e:
        logging.error(f"Error resetting progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/dev/reset-progress")
async def dev_reset_progress(email: str = "supanshah51191@gmail.com"):
    """Reset user progress by email (dev only)"""
    try:
        # Find user by email
        user = await db.users.find_one({"email": email})
        if not user:
            return {"message": f"User {email} not found"}
        
        user_id = user.get("user_id", str(user.get("_id")))
        
        # Delete user's progress
        await db.user_progress.delete_many({"user_id": user_id})
        
        # Reset user stats
        await db.users.update_one(
            {"email": email},
            {"$set": {
                "total_played": 0,
                "correct_answers": 0,
                "current_streak": 0,
                "best_streak": 0
            }}
        )
        
        return {"message": f"Progress reset for {email}"}
    
    except Exception as e:
        logging.error(f"Error resetting progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ADMIN ENDPOINTS ====================

# Admin credentials (in production, use environment variables)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "@dm!n!spl@ying"

class AdminLoginRequest(BaseModel):
    username: str
    password: str

class AdminResetProgressRequest(BaseModel):
    email: str

class AddPlayableRequest(BaseModel):
    type: str  # "text", "image", "video", "image_text", "video_text"
    answer_type: str  # "mcq", "text_input"
    category: str
    title: str
    question_text: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    options: Optional[List[str]] = None  # For MCQ (4 options)
    correct_answer: str
    answer_explanation: Optional[str] = None  # Brief explanation of the answer
    difficulty: str = "medium"

@api_router.post("/admin/login")
async def admin_login(request: AdminLoginRequest):
    """Admin login endpoint"""
    if request.username == ADMIN_USERNAME and request.password == ADMIN_PASSWORD:
        # Generate admin session token
        admin_token = f"admin_{uuid.uuid4().hex}"
        
        try:
            # Store admin session (expires in 24 hours)
            result = await db.admin_sessions.insert_one({
                "token": admin_token,
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(hours=24)
            })
            logging.info(f"Admin session created: {admin_token}, inserted_id: {result.inserted_id}")
        except Exception as e:
            logging.error(f"Failed to create admin session: {e}")
            raise HTTPException(status_code=500, detail="Failed to create session")
        
        return {"success": True, "token": admin_token}
    else:
        raise HTTPException(status_code=401, detail="Invalid credentials")

async def verify_admin_token(authorization: Optional[str] = Header(None)):
    """Verify admin token"""
    logging.info(f"verify_admin_token called with auth: {authorization}")
    if not authorization:
        logging.warning("No authorization header provided")
        raise HTTPException(status_code=401, detail="Admin token required")
    
    token = authorization.replace("Bearer ", "")
    logging.info(f"Verifying admin token: {token[:20]}...")
    
    try:
        session = await db.admin_sessions.find_one({"token": token})
        logging.info(f"Session lookup result: {session}")
    except Exception as e:
        logging.error(f"Error looking up session: {e}")
        raise HTTPException(status_code=500, detail="Database error")
    
    if not session:
        logging.warning(f"Admin session not found for token: {token[:20]}...")
        raise HTTPException(status_code=401, detail="Invalid admin token - session not found")
    
    logging.info(f"Admin session found, expires at: {session.get('expires_at')}")
    
    # Check expiry
    expires_at = session["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Admin session expired")
    
    return True

@api_router.post("/admin/reset-user-progress")
async def admin_reset_user_progress(
    request: AdminResetProgressRequest,
    _: bool = Depends(verify_admin_token)
):
    """Reset progress for a specific user by email (admin only)"""
    try:
        # Find user by email
        user = await db.users.find_one({"email": request.email})
        if not user:
            raise HTTPException(status_code=404, detail=f"User with email {request.email} not found")
        
        user_id = user.get("user_id", str(user.get("_id")))
        
        # Delete user's progress
        deleted = await db.user_progress.delete_many({"user_id": user_id})
        
        # Reset user stats
        await db.users.update_one(
            {"email": request.email},
            {"$set": {
                "total_played": 0,
                "correct_answers": 0,
                "current_streak": 0,
                "best_streak": 0
            }}
        )
        
        return {
            "success": True,
            "message": f"Progress reset for {request.email}",
            "deleted_progress_count": deleted.deleted_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error resetting progress: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/add-playable")
async def admin_add_playable(
    request: AddPlayableRequest,
    _: bool = Depends(verify_admin_token)
):
    """Add a new playable content (admin only)"""
    try:
        # Validate based on type
        question = {}
        
        # Add text if provided
        if request.question_text:
            question["text"] = request.question_text
        
        # Add image URL if provided
        if request.image_url:
            question["image_base64"] = request.image_url  # Using same field name for compatibility
        
        # Add video URL if provided
        if request.video_url:
            question["video_url"] = request.video_url
        
        # Validate required fields based on type
        if request.type in ["text", "text_mcq"] and not request.question_text:
            raise HTTPException(status_code=400, detail="Text question requires question_text")
        
        if request.type in ["image", "image_text"] and not request.image_url:
            raise HTTPException(status_code=400, detail="Image question requires image_url")
        
        if request.type in ["video", "video_text"] and not request.video_url:
            raise HTTPException(status_code=400, detail="Video question requires video_url")
        
        # Validate MCQ has options
        if request.answer_type == "mcq":
            if not request.options or len(request.options) < 2:
                raise HTTPException(status_code=400, detail="MCQ requires at least 2 options")
            if request.correct_answer not in request.options:
                raise HTTPException(status_code=400, detail="Correct answer must be one of the options")
        
        # Create playable
        playable_id = f"play_{uuid.uuid4().hex[:12]}"
        playable_doc = {
            "playable_id": playable_id,
            "type": request.type,
            "answer_type": request.answer_type,
            "category": request.category,
            "title": request.title,
            "question": question,
            "options": request.options if request.answer_type == "mcq" else None,
            "correct_answer": request.correct_answer,
            "answer_explanation": request.answer_explanation,
            "difficulty": request.difficulty,
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.playables.insert_one(playable_doc)
        
        return {
            "success": True,
            "message": "Playable added successfully",
            "playable_id": playable_id
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding playable: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/playables")
async def admin_get_playables(_: bool = Depends(verify_admin_token)):
    """Get all playables (admin only)"""
    try:
        playables = await db.playables.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return {"playables": playables, "count": len(playables)}
    except Exception as e:
        logging.error(f"Error getting playables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/admin/playables/{playable_id}")
async def admin_delete_playable(playable_id: str, _: bool = Depends(verify_admin_token)):
    """Delete a playable (admin only)"""
    try:
        result = await db.playables.delete_one({"playable_id": playable_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Playable not found")
        return {"success": True, "message": "Playable deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting playable: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/users")
async def admin_get_users(_: bool = Depends(verify_admin_token)):
    """Get all users (admin only)"""
    try:
        users = await db.users.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
        return {"users": users, "count": len(users)}
    except Exception as e:
        logging.error(f"Error getting users: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/stats")
async def admin_get_stats(date: str = None, _: bool = Depends(verify_admin_token)):
    """Get user performance stats for a specific date (admin only)
    
    Args:
        date: Date in YYYY-MM-DD format. If not provided, returns stats for today.
    """
    try:
        # Parse date or use today
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            target_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Date range for the selected day
        start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
        
        # Get all users
        all_users = await db.users.find({}, {"_id": 0}).to_list(1000)
        
        # Get progress records for the target date
        progress_records = await db.user_progress.find({
            "timestamp": {"$gte": start_of_day, "$lt": end_of_day}
        }, {"_id": 0}).to_list(10000)
        
        # Build stats per user
        user_stats = []
        for user in all_users:
            user_id = user.get("user_id")
            email = user.get("email", "Unknown")
            name = user.get("name", "Unknown")
            
            # Filter progress for this user on target date
            user_progress = [p for p in progress_records if p.get("user_id") == user_id]
            
            played_count = len(user_progress)
            correct_count = sum(1 for p in user_progress if p.get("correct", False))
            incorrect_count = played_count - correct_count
            
            # Calculate accuracy
            accuracy = round((correct_count / played_count * 100), 1) if played_count > 0 else 0
            
            user_stats.append({
                "user_id": user_id,
                "email": email,
                "name": name,
                "played": played_count,
                "correct": correct_count,
                "incorrect": incorrect_count,
                "accuracy": accuracy,
                "current_streak": user.get("current_streak", 0),
                "best_streak": user.get("best_streak", 0),
                "total_played_all_time": user.get("total_played", 0),
                "total_correct_all_time": user.get("correct_answers", 0),
            })
        
        # Sort by played count (descending)
        user_stats.sort(key=lambda x: x["played"], reverse=True)
        
        # Calculate totals
        total_played = sum(u["played"] for u in user_stats)
        total_correct = sum(u["correct"] for u in user_stats)
        active_users = sum(1 for u in user_stats if u["played"] > 0)
        
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "summary": {
                "total_users": len(all_users),
                "active_users": active_users,
                "total_played": total_played,
                "total_correct": total_correct,
                "overall_accuracy": round((total_correct / total_played * 100), 1) if total_played > 0 else 0
            },
            "user_stats": user_stats
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ==================== BULK UPLOAD ENDPOINTS ====================

from fastapi import UploadFile, File
from fastapi.responses import StreamingResponse
import io
import csv
from openpyxl import Workbook, load_workbook

# Sample data for templates
SAMPLE_DATA = {
    "text_mcq": [
        {"category": "Science", "title": "Chemistry Basics", "question_text": "What is H2O commonly known as?", 
         "option_1": "Salt", "option_2": "Water", "option_3": "Sugar", "option_4": "Oil", 
         "correct_answer": "Water", "answer_explanation": "H2O is the chemical formula for water, consisting of 2 hydrogen atoms and 1 oxygen atom.", "difficulty": "easy"},
        {"category": "History", "title": "Ancient Civilizations", "question_text": "Which civilization built the pyramids?", 
         "option_1": "Roman", "option_2": "Greek", "option_3": "Egyptian", "option_4": "Persian", 
         "correct_answer": "Egyptian", "answer_explanation": "The ancient Egyptians built the pyramids around 2500 BCE as tombs for their pharaohs.", "difficulty": "easy"},
    ],
    "text_input": [
        {"category": "Geography", "title": "World Capitals", "question_text": "What is the capital of France?", 
         "correct_answer": "Paris", "answer_explanation": "Paris has been the capital of France since 987 AD and is known as the 'City of Light'.", "difficulty": "easy"},
        {"category": "Literature", "title": "Famous Authors", "question_text": "Who wrote 'Hamlet'?", 
         "correct_answer": "Shakespeare", "answer_explanation": "William Shakespeare wrote Hamlet around 1600. It's considered one of the greatest plays ever written.", "difficulty": "medium"},
    ],
    "image_mcq": [
        {"category": "Art", "title": "Famous Paintings", "image_url": "https://example.com/image1.jpg", 
         "question_text": "Who painted this artwork?", 
         "option_1": "Van Gogh", "option_2": "Picasso", "option_3": "Da Vinci", "option_4": "Monet", 
         "correct_answer": "Da Vinci", "answer_explanation": "Leonardo da Vinci was an Italian Renaissance polymath known for masterpieces like the Mona Lisa.", "difficulty": "medium"},
    ],
    "image_text_input": [
        {"category": "Geography", "title": "Landmarks", "image_url": "https://example.com/landmark.jpg", 
         "question_text": "Name this famous landmark", 
         "correct_answer": "Eiffel Tower", "answer_explanation": "The Eiffel Tower was built in 1889 for the World's Fair and stands 330 meters tall in Paris.", "difficulty": "easy"},
    ],
    "video_mcq": [
        {"category": "Science", "title": "Physics Demo", "video_url": "https://example.com/video.mp4", 
         "question_text": "What principle is demonstrated in this video?", 
         "option_1": "Gravity", "option_2": "Magnetism", "option_3": "Electricity", "option_4": "Sound", 
         "correct_answer": "Gravity", "answer_explanation": "Gravity is the force that attracts objects with mass toward each other, as demonstrated by falling objects.", "difficulty": "medium"},
    ],
    "video_text_input": [
        {"category": "Music", "title": "Instruments", "video_url": "https://example.com/music.mp4", 
         "question_text": "What instrument is being played?", 
         "correct_answer": "Piano", "answer_explanation": "The piano was invented around 1700 and is known for its wide range and expressive capabilities.", "difficulty": "easy"},
    ],
}

def get_template_columns(format_type: str) -> List[str]:
    """Get column headers for each format type"""
    base_cols = ["category", "title", "difficulty"]
    
    if format_type == "text_mcq":
        return base_cols + ["question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "text_input":
        return base_cols + ["question_text", "correct_answer", "answer_explanation"]
    elif format_type == "image_mcq":
        return base_cols + ["image_url", "question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "image_text_input":
        return base_cols + ["image_url", "question_text", "correct_answer", "answer_explanation"]
    elif format_type == "video_mcq":
        return base_cols + ["video_url", "question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "video_text_input":
        return base_cols + ["video_url", "question_text", "correct_answer", "answer_explanation"]
    else:
        return base_cols + ["question_text", "correct_answer", "answer_explanation"]

@api_router.get("/admin/template/{format_type}")
async def download_template(format_type: str, file_format: str = "xlsx", _: bool = Depends(verify_admin_token)):
    """Download sample template for bulk upload"""
    
    valid_formats = ["text_mcq", "text_input", "image_mcq", "image_text_input", "video_mcq", "video_text_input"]
    if format_type not in valid_formats:
        raise HTTPException(status_code=400, detail=f"Invalid format type. Valid types: {valid_formats}")
    
    columns = get_template_columns(format_type)
    sample_data = SAMPLE_DATA.get(format_type, [])
    
    if file_format == "csv":
        # Generate CSV
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        for row in sample_data:
            writer.writerow({col: row.get(col, "") for col in columns})
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=template_{format_type}.csv"}
        )
    else:
        # Generate Excel
        wb = Workbook()
        ws = wb.active
        ws.title = format_type
        
        # Add headers
        for col_idx, col_name in enumerate(columns, 1):
            cell = ws.cell(row=1, column=col_idx, value=col_name)
            cell.font = cell.font.copy(bold=True)
        
        # Add sample data
        for row_idx, row_data in enumerate(sample_data, 2):
            for col_idx, col_name in enumerate(columns, 1):
                ws.cell(row=row_idx, column=col_idx, value=row_data.get(col_name, ""))
        
        # Add instructions sheet
        ws_instructions = wb.create_sheet("Instructions")
        instructions = [
            "BULK UPLOAD INSTRUCTIONS",
            "",
            f"Format Type: {format_type.upper()}",
            "",
            "COLUMN DESCRIPTIONS:",
            "- category: The category/topic of the question (e.g., Science, History)",
            "- title: A short title for the question",
            "- difficulty: easy, medium, or hard",
            "- question_text: The actual question to display",
            "- correct_answer: The correct answer (must match one of the options for MCQ)",
        ]
        
        if "mcq" in format_type:
            instructions.extend([
                "- option_1 to option_4: The four multiple choice options",
                "",
                "IMPORTANT: correct_answer MUST exactly match one of the options!"
            ])
        
        if "image" in format_type:
            instructions.append("- image_url: Public URL to the image (must be accessible)")
        if "video" in format_type:
            instructions.append("- video_url: Public URL to the video file (mp4 recommended)")
        
        for row_idx, line in enumerate(instructions, 1):
            ws_instructions.cell(row=row_idx, column=1, value=line)
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=template_{format_type}.xlsx"}
        )

@api_router.post("/admin/bulk-upload")
async def bulk_upload_playables(
    file: UploadFile = File(...),
    format_type: str = "text_mcq",
    _: bool = Depends(verify_admin_token)
):
    """Bulk upload playables from Excel or CSV file"""
    
    valid_formats = ["text_mcq", "text_input", "image_mcq", "image_text_input", "video_mcq", "video_text_input"]
    if format_type not in valid_formats:
        raise HTTPException(status_code=400, detail=f"Invalid format type. Valid types: {valid_formats}")
    
    # Read file
    content = await file.read()
    
    try:
        rows = []
        
        if file.filename.endswith('.csv'):
            # Parse CSV
            text_content = content.decode('utf-8')
            reader = csv.DictReader(io.StringIO(text_content))
            rows = list(reader)
        elif file.filename.endswith(('.xlsx', '.xls')):
            # Parse Excel
            wb = load_workbook(io.BytesIO(content))
            ws = wb.active
            
            # Get headers from first row
            headers = [cell.value for cell in ws[1] if cell.value]
            
            # Get data rows
            for row in ws.iter_rows(min_row=2, values_only=True):
                if any(row):  # Skip empty rows
                    row_dict = {headers[i]: row[i] for i in range(len(headers)) if i < len(row)}
                    rows.append(row_dict)
        else:
            raise HTTPException(status_code=400, detail="Invalid file format. Please upload .csv or .xlsx file")
        
        if not rows:
            raise HTTPException(status_code=400, detail="No data found in file")
        
        # Process rows and create playables
        created = []
        errors = []
        
        for idx, row in enumerate(rows, 1):
            try:
                # Validate required fields
                category = row.get('category', '').strip()
                title = row.get('title', '').strip()
                question_text = row.get('question_text', '').strip()
                correct_answer = row.get('correct_answer', '').strip()
                difficulty = row.get('difficulty', 'medium').strip().lower()
                
                if not category or not title or not correct_answer:
                    errors.append(f"Row {idx}: Missing required fields (category, title, or correct_answer)")
                    continue
                
                # Build question object
                question = {}
                if question_text:
                    question["text"] = question_text
                
                # Handle image/video URLs
                if "image" in format_type:
                    image_url = row.get('image_url', '').strip()
                    if image_url:
                        question["image_base64"] = image_url  # Using same field for compatibility
                    else:
                        errors.append(f"Row {idx}: Image URL required for image format")
                        continue
                
                if "video" in format_type:
                    video_url = row.get('video_url', '').strip()
                    if video_url:
                        question["video_url"] = video_url
                    else:
                        errors.append(f"Row {idx}: Video URL required for video format")
                        continue
                
                # Determine type and answer_type
                if format_type == "text_mcq":
                    playable_type = "text"
                    answer_type = "mcq"
                elif format_type == "text_input":
                    playable_type = "text"
                    answer_type = "text_input"
                elif format_type == "image_mcq":
                    playable_type = "image"
                    answer_type = "mcq"
                elif format_type == "image_text_input":
                    playable_type = "image_text"
                    answer_type = "text_input"
                elif format_type == "video_mcq":
                    playable_type = "video"
                    answer_type = "mcq"
                elif format_type == "video_text_input":
                    playable_type = "video_text"
                    answer_type = "text_input"
                else:
                    playable_type = "text"
                    answer_type = "text_input"
                
                # Handle MCQ options
                options = None
                if "mcq" in format_type:
                    options = [
                        row.get('option_1', '').strip(),
                        row.get('option_2', '').strip(),
                        row.get('option_3', '').strip(),
                        row.get('option_4', '').strip(),
                    ]
                    options = [o for o in options if o]  # Remove empty options
                    
                    if len(options) < 2:
                        errors.append(f"Row {idx}: MCQ requires at least 2 options")
                        continue
                    
                    if correct_answer not in options:
                        errors.append(f"Row {idx}: Correct answer '{correct_answer}' not in options")
                        continue
                
                # Create playable document
                playable_id = f"play_{uuid.uuid4().hex[:12]}"
                playable_doc = {
                    "playable_id": playable_id,
                    "type": playable_type,
                    "answer_type": answer_type,
                    "category": category,
                    "title": title,
                    "question": question,
                    "options": options,
                    "correct_answer": correct_answer,
                    "difficulty": difficulty if difficulty in ["easy", "medium", "hard"] else "medium",
                    "created_at": datetime.now(timezone.utc)
                }
                
                await db.playables.insert_one(playable_doc)
                created.append({"row": idx, "playable_id": playable_id, "title": title})
                
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
        
        return {
            "success": True,
            "total_rows": len(rows),
            "created_count": len(created),
            "error_count": len(errors),
            "created": created,
            "errors": errors
        }
        
    except Exception as e:
        logging.error(f"Bulk upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@api_router.get("/admin/template-formats")
async def get_template_formats(_: bool = Depends(verify_admin_token)):
    """Get list of available template formats"""
    return {
        "formats": [
            {"id": "text_mcq", "name": "Text + MCQ", "description": "Text question with 4 multiple choice options"},
            {"id": "text_input", "name": "Text + Text Input", "description": "Text question with typed answer"},
            {"id": "image_mcq", "name": "Image + MCQ", "description": "Image with text question and 4 MCQ options"},
            {"id": "image_text_input", "name": "Image + Text Input", "description": "Image with text question and typed answer"},
            {"id": "video_mcq", "name": "Video + MCQ", "description": "Video with text question and 4 MCQ options"},
            {"id": "video_text_input", "name": "Video + Text Input", "description": "Video with text question and typed answer"},
        ]
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
