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
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
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
            "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
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
        
        # Get playables not yet answered
        query = {}
        if answered_ids:
            query["playable_id"] = {"$nin": answered_ids}
        
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
        "best_streak": current_user.best_streak
    }

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

@api_router.post("/admin/add-playable")
async def add_playable(playable: Playable, current_user: User = Depends(require_auth)):
    """Add a new playable to the database"""
    try:
        playable_dict = playable.dict()
        playable_dict["playable_id"] = f"play_{uuid.uuid4().hex[:12]}"
        playable_dict["created_at"] = datetime.now(timezone.utc)
        
        await db.playables.insert_one(playable_dict)
        
        return {"message": "Playable added successfully", "playable_id": playable_dict["playable_id"]}
    
    except Exception as e:
        logging.error(f"Error adding playable: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/playables")
async def get_all_playables(current_user: User = Depends(require_auth)):
    """Get all playables (admin view)"""
    try:
        playables = await db.playables.find({}, {"_id": 0}).to_list(1000)
        return {"count": len(playables), "playables": playables}
    
    except Exception as e:
        logging.error(f"Error fetching playables: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/admin/reset-progress")
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
