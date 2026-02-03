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
    type: str  # "video", "image", "text", "video_text", "image_text", "chess", "guess_the_x"
    answer_type: str  # "mcq", "text_input"
    category: str
    title: str
    question: Dict[str, Any]  # {text?, video_url?, image_base64?, image_url?}
    options: Optional[List[str]] = None  # For MCQ
    correct_answer: str
    alternate_answers: Optional[List[str]] = None  # For text_input: spelling variants, short forms
    answer_explanation: Optional[str] = None  # Brief explanation of the answer
    hints: Optional[List[str]] = None  # For guess_the_x: 3-5 hints revealed progressively
    difficulty: str = "medium"
    created_at: datetime

class AnswerSubmission(BaseModel):
    answer: str

class GuessAnswerSubmission(BaseModel):
    answer: str
    hint_number: int  # Which hint the user is on (1-based)

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

# Valid Ionicons names (comprehensive list for validation)
# Source: https://ionic.io/ionicons
VALID_IONICONS = {
    # General
    "add", "add-circle", "remove", "remove-circle", "close", "close-circle",
    "checkmark", "checkmark-circle", "checkmark-done", "alert", "alert-circle",
    "information", "information-circle", "help", "help-circle", "warning",
    
    # Navigation & Actions
    "arrow-back", "arrow-forward", "arrow-up", "arrow-down", "chevron-back",
    "chevron-forward", "chevron-up", "chevron-down", "caret-back", "caret-forward",
    "caret-up", "caret-down", "menu", "ellipsis-horizontal", "ellipsis-vertical",
    "options", "settings", "cog", "build", "construct", "hammer", "key",
    
    # Media & Files
    "play", "pause", "stop", "volume-high", "volume-low", "volume-mute",
    "mic", "mic-off", "camera", "videocam", "image", "images", "film",
    "musical-notes", "musical-note", "headset", "radio", "tv", "desktop",
    "laptop", "phone-portrait", "tablet-portrait", "watch", "print",
    "document", "documents", "folder", "folder-open", "file-tray",
    "archive", "trash", "download", "cloud-download", "upload", "cloud-upload",
    "share", "share-social", "link", "copy", "clipboard", "cut",
    
    # Communication
    "mail", "mail-open", "send", "chatbox", "chatbubble", "chatbubbles",
    "call", "notifications", "notifications-off", "megaphone", "at",
    
    # People & Social
    "person", "person-add", "people", "body", "man", "woman",
    "happy", "sad", "skull", "heart", "heart-dislike", "thumbs-up", "thumbs-down",
    
    # Nature & Weather
    "sunny", "moon", "cloudy", "rainy", "thunderstorm", "snow", "flame", "bonfire",
    "water", "leaf", "flower", "rose", "earth", "globe", "planet", "star",
    
    # Objects
    "home", "business", "storefront", "cafe", "restaurant", "fast-food", "pizza", "beer",
    "wine", "ice-cream", "nutrition", "fitness", "medkit", "bandage", "pulse",
    "eye", "eye-off", "glasses", "shirt", "gift", "pricetag", "pricetags",
    "cart", "bag", "basket", "wallet", "card", "cash", "calculator", "receipt",
    "barcode", "qr-code", "scan", "sparkles", "ribbon", "medal", "trophy",
    
    # Transportation
    "airplane", "car", "bus", "train", "subway", "boat", "bicycle", "walk",
    "navigate", "compass", "map", "location", "pin", "flag",
    
    # Technology & Science
    "bulb", "flashlight", "flash", "battery-charging", "battery-full",
    "wifi", "bluetooth", "cellular", "radio-button-on", "toggle",
    "hardware-chip", "server", "terminal", "code", "code-slash",
    "git-branch", "git-commit", "git-merge", "git-pull-request",
    "logo-github", "logo-javascript", "logo-python", "logo-react",
    "flask", "beaker", "nuclear", "magnet", "prism", "cube", "shapes",
    
    # Sports & Games
    "football", "american-football", "basketball", "baseball", "tennisball",
    "golf", "fish", "game-controller", "dice", "extension-puzzle",
    
    # Education & Culture
    "book", "library", "school", "easel", "color-palette", "brush", "pencil",
    "create", "newspaper", "reader", "language", "text",
    
    # Time & Calendar
    "time", "timer", "stopwatch", "hourglass", "alarm", "calendar", "today",
    
    # Security
    "lock-closed", "lock-open", "shield", "shield-checkmark", "finger-print",
    
    # Misc
    "infinite", "rocket", "telescope", "binoculars", "aperture", "contrast",
    "layers", "grid", "apps", "analytics", "bar-chart", "pie-chart", "stats-chart",
    "trending-up", "trending-down", "podium", "funnel", "filter",
    "refresh", "reload", "sync", "repeat", "shuffle", "swap-horizontal",
    "expand", "contract", "resize", "move", "crop", "color-fill",
    "attach", "paperclip", "push", "pulse", "log-in", "log-out", "exit",
    "enter", "return-down-back", "save", "search", "bug", "skull-outline",
}

def is_valid_icon(icon_name: str) -> bool:
    """Check if icon name is a valid Ionicons name"""
    if not icon_name:
        return False
    # Also accept outline/sharp variants
    base_icon = icon_name.replace("-outline", "").replace("-sharp", "")
    return icon_name in VALID_IONICONS or base_icon in VALID_IONICONS

# Default category icons and colors mapping (used for initialization)
DEFAULT_CATEGORY_STYLES = {
    "SCIENCE": {"icon": "flask", "color": "#4CAF50"},
    "GEOGRAPHY": {"icon": "globe", "color": "#2196F3"},
    "HISTORY": {"icon": "time", "color": "#FF9800"},
    "LITERATURE": {"icon": "book", "color": "#9C27B0"},
    "SPORTS": {"icon": "american-football", "color": "#F44336"},
    "MUSIC": {"icon": "musical-notes", "color": "#E91E63"},
    "ART": {"icon": "color-palette", "color": "#00BCD4"},
    "MOVIES": {"icon": "film", "color": "#795548"},
    "TECHNOLOGY": {"icon": "hardware-chip", "color": "#607D8B"},
    "FOOD": {"icon": "restaurant", "color": "#FF5722"},
    "NATURE": {"icon": "leaf", "color": "#8BC34A"},
    "ANIMALS": {"icon": "paw", "color": "#FFEB3B"},
    "MATHEMATICS": {"icon": "calculator", "color": "#3F51B5"},
    "MATHS": {"icon": "calculator", "color": "#3F51B5"},
    "LANGUAGES": {"icon": "language", "color": "#009688"},
    "GENERAL": {"icon": "help-circle", "color": "#9E9E9E"},
    "CRICKET": {"icon": "baseball", "color": "#4CAF50"},
    "POP CULTURE": {"icon": "star", "color": "#E91E63"},
    "CHESS": {"icon": "extension-puzzle", "color": "#607D8B"},
    "BOLLYWOOD": {"icon": "videocam", "color": "#FF5722"},
    "FOOTBALL": {"icon": "football", "color": "#4CAF50"},
    "POLITICS": {"icon": "podium", "color": "#9C27B0"},
    "ENTERTAINMENT": {"icon": "tv", "color": "#E91E63"},
    "GAMING": {"icon": "game-controller", "color": "#00BCD4"},
    "TRIVIA": {"icon": "bulb", "color": "#FFEB3B"},
}

def get_default_category_style(category_name: str) -> dict:
    """Get default icon and color for a category"""
    upper_name = category_name.upper()
    if upper_name in DEFAULT_CATEGORY_STYLES:
        return DEFAULT_CATEGORY_STYLES[upper_name]
    # Default style for unknown categories
    return {"icon": "help-circle", "color": "#00FF87"}

# Model for adding a new category
class AddCategoryRequest(BaseModel):
    name: str
    icon: Optional[str] = "help-circle"
    color: Optional[str] = "#00FF87"

@api_router.get("/categories")
async def get_categories(current_user: User = Depends(require_auth)):
    """Get all available categories from the managed categories collection"""
    try:
        # Get categories from the managed collection
        categories_cursor = db.categories.find({}, {"_id": 0}).sort("name", 1)
        categories = await categories_cursor.to_list(100)
        
        # Get playable counts for each category
        pipeline = [
            {"$group": {"_id": "$category", "count": {"$sum": 1}}}
        ]
        category_counts = await db.playables.aggregate(pipeline).to_list(100)
        count_map = {c["_id"]: c["count"] for c in category_counts}
        
        # Add playable_count to each category
        for cat in categories:
            cat["playable_count"] = count_map.get(cat["name"], 0)
        
        return {"categories": categories}
    except Exception as e:
        logging.error(f"Error fetching categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/categories/list")
async def get_categories_list():
    """Get all category names (public endpoint for validation)"""
    try:
        categories = await db.categories.find({}, {"_id": 0, "name": 1}).to_list(100)
        return {"categories": [c["name"] for c in categories]}
    except Exception as e:
        logging.error(f"Error fetching categories list: {e}")
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
    limit: int = 10,
    last_category: Optional[str] = None,
    last_format: Optional[str] = None,
    current_user: User = Depends(require_auth)
):
    """Get playables feed - simplified logic
    
    1. First serve curated 10 playables in order (if not played/skipped)
    2. After that, show all remaining playables in random order
    """
    try:
        # ============ CURATED DEMO PLAYABLES (HARDCODED ORDER) ============
        # These 10 playables will be shown first, in this exact order
        CURATED_PLAYABLE_IDS = [
            "play_fbf745c05db8",   # 1. Bollywood
            "play_9c2d0aedae90",   # 2. Indian PM no confidence
            "play_79d9fe88f784",   # 3. Australia Capital
            "play_1fdb01350d05",   # 4. Right or Wrong logo (This or That)
            "play_87f944dcfcb1",   # 5. Maths Puzzle
            "play_520619533384",   # 6. Chess Mate in 2
            "play_9ddad6ff412e",   # 7. Cricket (Guess in 5)
            "play_3db9f04a1b9b",   # 8. AI or not
            "play_ae527aa40493",   # 9. Quick Estimation
            "play_8b45d1dfbb71",   # 10. Grammy
        ]
        
        # Get user's played/skipped playable IDs
        played_records = await db.user_progress.find(
            {"user_id": current_user.user_id},
            {"playable_id": 1}
        ).to_list(length=10000)
        played_ids = {r["playable_id"] for r in played_records}
        
        result_playables = []
        
        # ============ PHASE 1: Serve curated playables first ============
        unplayed_curated_ids = [pid for pid in CURATED_PLAYABLE_IDS if pid not in played_ids]
        
        for pid in unplayed_curated_ids[:limit]:
            playable = await db.playables.find_one({"playable_id": pid})
            if playable:
                playable["_id"] = str(playable["_id"])
                result_playables.append(playable)
        
        # If we have enough curated, return them
        if len(result_playables) >= limit:
            return result_playables[:limit]
        
        # ============ PHASE 2: Fill remaining with random playables ============
        remaining_needed = limit - len(result_playables)
        
        if remaining_needed > 0:
            # Get random playables that are:
            # 1. Not in curated list (already handled above)
            # 2. Not already played/skipped
            exclude_ids = list(played_ids) + CURATED_PLAYABLE_IDS
            
            random_pipeline = [
                {"$match": {"playable_id": {"$nin": exclude_ids}}},
                {"$sample": {"size": remaining_needed}},
            ]
            
            random_playables = await db.playables.aggregate(random_pipeline).to_list(remaining_needed)
            
            for p in random_playables:
                p["_id"] = str(p["_id"])
                result_playables.append(p)
        
        return result_playables
        if len(playables) < limit:
            # Get any remaining unplayed content
            fallback_pipeline = [
                {"$match": category_filter} if category_filter else {"$match": {}},
                {"$sample": {"size": 200}},
                {
                    "$lookup": {
                        "from": "user_progress",
                        "let": {"pid": "$playable_id"},
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$and": [
                                            {"$eq": ["$playable_id", "$$pid"]},
                                            {"$eq": ["$user_id", current_user.user_id]}
                                        ]
                                    }
                                }
                            }
                        ],
                        "as": "played"
                    }
                },
                {"$match": {"played": {"$size": 0}}},
                {"$limit": limit},
                {"$project": {"played": 0, "_id": 0}}
            ]
            
            if not category_filter:
                fallback_pipeline = fallback_pipeline[1:]
            
            playables = await db.playables.aggregate(fallback_pipeline).to_list(limit)
        
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
        
        # Also check alternate answers for text input questions
        if not is_correct and playable.get("alternate_answers"):
            user_answer = submission.answer.strip().lower()
            for alt in playable["alternate_answers"]:
                if user_answer == alt.strip().lower():
                    is_correct = True
                    break
        
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

@api_router.post("/playables/{playable_id}/guess-answer")
async def submit_guess_answer(
    playable_id: str,
    submission: GuessAnswerSubmission,
    current_user: User = Depends(require_auth)
):
    """Submit answer for a 'Guess the X' playable - returns feedback based on hint number"""
    try:
        # Get playable
        playable = await db.playables.find_one(
            {"playable_id": playable_id},
            {"_id": 0}
        )
        
        if not playable:
            raise HTTPException(status_code=404, detail="Playable not found")
        
        if playable.get("type") != "guess_the_x":
            raise HTTPException(status_code=400, detail="This endpoint is only for 'Guess the X' playables")
        
        # Check answer
        is_correct = submission.answer.strip().lower() == playable["correct_answer"].strip().lower()
        
        # Also check alternate answers
        if not is_correct and playable.get("alternate_answers"):
            user_answer = submission.answer.strip().lower()
            for alt in playable["alternate_answers"]:
                if user_answer == alt.strip().lower():
                    is_correct = True
                    break
        
        hints = playable.get("hints", [])
        total_hints = len(hints)
        hint_number = submission.hint_number
        
        # Generate feedback message based on which hint they got it on
        feedback_messages = [
            "Incredible! You're a mind reader! 🧠",  # 1st hint
            "Impressive! You've got sharp instincts! 🎯",  # 2nd hint
            "Well done! You really know your stuff! 💪",  # 3rd hint
            "Nice work! You figured it out! 👏",  # 4th hint
            "Got it! Better late than never! ✓"  # 5th hint
        ]
        
        feedback_message = ""
        if is_correct and hint_number <= len(feedback_messages):
            feedback_message = feedback_messages[hint_number - 1]
        
        # Only save progress and update stats if correct or all hints exhausted
        if is_correct or hint_number >= total_hints:
            progress = {
                "user_id": current_user.user_id,
                "playable_id": playable_id,
                "answered": True,
                "correct": is_correct,
                "hints_used": hint_number,
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
                "feedback_message": feedback_message,
                "hints_used": hint_number,
                "total_hints": total_hints,
                "all_hints_exhausted": hint_number >= total_hints and not is_correct,
                "current_streak": new_current_streak,
                "best_streak": new_best_streak,
                "total_played": new_total_played,
                "correct_answers": new_correct_answers
            }
        else:
            # Wrong answer but more hints available
            return {
                "correct": False,
                "correct_answer": None,  # Don't reveal yet
                "feedback_message": "",
                "hints_used": hint_number,
                "total_hints": total_hints,
                "all_hints_exhausted": False,
                "reveal_next_hint": True
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error submitting guess answer: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class ChessPuzzleSubmission(BaseModel):
    solved: bool
    moves_used: int  # Number of moves used to solve

@api_router.post("/playables/{playable_id}/chess-solved")
async def submit_chess_puzzle_result(
    playable_id: str,
    submission: ChessPuzzleSubmission,
    current_user: User = Depends(require_auth)
):
    """Submit chess puzzle result"""
    try:
        # Get playable
        playable = await db.playables.find_one(
            {"playable_id": playable_id},
            {"_id": 0}
        )
        
        if not playable:
            raise HTTPException(status_code=404, detail="Playable not found")
        
        if playable.get("type") != "chess_mate_in_2":
            raise HTTPException(status_code=400, detail="This endpoint is for chess puzzles only")
        
        is_correct = submission.solved
        
        # Save progress
        progress = {
            "user_id": current_user.user_id,
            "playable_id": playable_id,
            "answered": True,
            "correct": is_correct,
            "moves_used": submission.moves_used,
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
            "moves_used": submission.moves_used,
            "current_streak": new_current_streak,
            "best_streak": new_best_streak,
            "total_played": new_total_played,
            "correct_answers": new_correct_answers
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error submitting chess puzzle result: {e}")
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
    type: str  # "text", "image", "video", "image_text", "video_text", "guess_the_x", "chess_mate_in_2", "this_or_that"
    answer_type: str  # "mcq", "text_input", "tap_select"
    category: str
    title: str
    question_text: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None
    video_start: Optional[int] = None  # Start time in seconds (for YouTube clips)
    video_end: Optional[int] = None    # End time in seconds (for YouTube clips)
    options: Optional[List[str]] = None  # For MCQ (4 options)
    correct_answer: str
    alternate_answers: Optional[List[str]] = None  # For text_input: spelling variants, short forms
    answer_explanation: Optional[str] = None  # Brief explanation of the answer
    hints: Optional[List[str]] = None  # For guess_the_x: 3-5 hints
    fen: Optional[str] = None  # For chess_mate_in_2: FEN position string
    solution: Optional[List[str]] = None  # For chess_mate_in_2: ALL moves in UCI format
    # This or That fields
    image_left_url: Optional[str] = None  # Left image URL
    image_right_url: Optional[str] = None  # Right image URL
    label_left: Optional[str] = None  # Label for left image (used for answer matching)
    label_right: Optional[str] = None  # Label for right image (used for answer matching)
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
        # Validate category exists
        category_exists = await db.categories.find_one({"name": {"$regex": f"^{request.category}$", "$options": "i"}})
        if not category_exists:
            raise HTTPException(status_code=400, detail=f"Category '{request.category}' does not exist. Please add it first in the Categories tab.")
        
        # Use the exact category name from database (preserves case)
        category_name = category_exists["name"]
        
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
        
        # Validate guess_the_x has hints
        if request.type == "guess_the_x":
            if not request.hints or len(request.hints) < 3:
                raise HTTPException(status_code=400, detail="Guess the X requires at least 3 hints")
            if len(request.hints) > 5:
                raise HTTPException(status_code=400, detail="Guess the X allows maximum 5 hints")
        
        # Validate chess_mate_in_2 has FEN and solution
        if request.type == "chess_mate_in_2":
            if not request.fen:
                raise HTTPException(status_code=400, detail="Chess puzzle requires a FEN position")
            if not request.solution or len(request.solution) < 1:
                raise HTTPException(status_code=400, detail="Chess puzzle requires at least 1 solution move")
        
        # Validate this_or_that has both images and labels
        if request.type == "this_or_that":
            if not request.image_left_url or not request.image_right_url:
                raise HTTPException(status_code=400, detail="This or That requires both left and right images")
            if not request.label_left or not request.label_right:
                raise HTTPException(status_code=400, detail="This or That requires labels for both images")
            if request.correct_answer not in [request.label_left, request.label_right]:
                raise HTTPException(status_code=400, detail="Correct answer must match one of the labels")
        
        if request.answer_type == "mcq" and request.type not in ["guess_the_x", "chess_mate_in_2", "this_or_that"]:
            if not request.options or len(request.options) < 2:
                raise HTTPException(status_code=400, detail="MCQ requires at least 2 options")
            if request.correct_answer not in request.options:
                raise HTTPException(status_code=400, detail="Correct answer must be one of the options")
        
        # Build question object for this_or_that
        if request.type == "this_or_that":
            question = {
                "text": request.question_text,
                "image_left": request.image_left_url,
                "image_right": request.image_right_url,
                "label_left": request.label_left,
                "label_right": request.label_right
            }
        
        # Create playable
        playable_id = f"play_{uuid.uuid4().hex[:12]}"
        playable_doc = {
            "playable_id": playable_id,
            "type": request.type,
            "answer_type": "tap_select" if request.type == "this_or_that" else ("text_input" if request.type in ["guess_the_x", "chess_mate_in_2"] else request.answer_type),
            "category": request.category,
            "title": request.title,
            "question": question,
            "options": request.options if request.answer_type == "mcq" and request.type not in ["guess_the_x", "chess_mate_in_2", "this_or_that"] else None,
            "correct_answer": request.correct_answer,
            "alternate_answers": request.alternate_answers if (request.answer_type == "text_input" or request.type in ["guess_the_x", "chess_mate_in_2"]) else None,
            "answer_explanation": request.answer_explanation,
            "hints": request.hints if request.type == "guess_the_x" else None,
            "fen": request.fen if request.type == "chess_mate_in_2" else None,
            "solution": request.solution if request.type == "chess_mate_in_2" else None,
            "video_start": request.video_start if request.type in ["video", "video_text"] else None,
            "video_end": request.video_end if request.type in ["video", "video_text"] else None,
            "difficulty": request.difficulty,
            "created_at": datetime.now(timezone.utc)
        }
        
        # Use the validated category name
        playable_doc["category"] = category_name
        
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

@api_router.put("/admin/playables/{playable_id}")
async def admin_update_playable(playable_id: str, request: AddPlayableRequest, _: bool = Depends(verify_admin_token)):
    """Update a playable (admin only)"""
    try:
        # Check if playable exists
        existing = await db.playables.find_one({"playable_id": playable_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Playable not found")
        
        # Build question object - MERGE with existing question data
        existing_question = existing.get("question", {})
        question = existing_question.copy()  # Start with existing data
        
        # Update only the fields that are provided
        if request.question_text is not None:
            question["text"] = request.question_text
        if request.image_url is not None:
            if request.image_url.startswith("data:"):
                question["image_base64"] = request.image_url
                question.pop("image_url", None)  # Remove other image field
            else:
                question["image_url"] = request.image_url
                question.pop("image_base64", None)  # Remove other image field
        if request.video_url is not None:
            question["video_url"] = request.video_url
        
        # Build update document
        update_doc = {
            "type": request.type,
            "answer_type": request.answer_type,
            "category": request.category,
            "title": request.title,
            "question": question,
            "options": request.options if request.answer_type == "mcq" and request.type not in ["guess_the_x", "chess_mate_in_2"] else None,
            "correct_answer": request.correct_answer,
            "alternate_answers": request.alternate_answers if (request.answer_type == "text_input" or request.type in ["guess_the_x", "chess_mate_in_2"]) else None,
            "answer_explanation": request.answer_explanation,
            "hints": request.hints if request.type == "guess_the_x" else None,
            "fen": request.fen if request.type == "chess_mate_in_2" else None,
            "solution": request.solution if request.type == "chess_mate_in_2" else None,
            "video_start": request.video_start,
            "video_end": request.video_end,
            "difficulty": request.difficulty,
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.playables.update_one(
            {"playable_id": playable_id},
            {"$set": update_doc}
        )
        
        return {"success": True, "message": "Playable updated successfully", "playable_id": playable_id}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating playable: {e}")
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

# ==================== ADMIN CATEGORY MANAGEMENT ====================

@api_router.get("/admin/categories")
async def admin_get_categories(_: bool = Depends(verify_admin_token)):
    """Get all managed categories (admin only)"""
    try:
        categories = await db.categories.find({}, {"_id": 0}).sort("name", 1).to_list(100)
        
        # Get playable counts for each category
        pipeline = [
            {"$group": {"_id": "$category", "count": {"$sum": 1}}}
        ]
        category_counts = await db.playables.aggregate(pipeline).to_list(100)
        count_map = {c["_id"]: c["count"] for c in category_counts}
        
        for cat in categories:
            cat["playable_count"] = count_map.get(cat["name"], 0)
        
        return {"categories": categories, "count": len(categories)}
    except Exception as e:
        logging.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/admin/valid-icons")
async def get_valid_icons(_: bool = Depends(verify_admin_token)):
    """Get list of all valid Ionicons names for category icons"""
    return {
        "icons": sorted(list(VALID_IONICONS)),
        "count": len(VALID_IONICONS)
    }

@api_router.post("/admin/categories")
async def admin_add_category(request: AddCategoryRequest, _: bool = Depends(verify_admin_token)):
    """Add a new category (admin only)"""
    try:
        # Validate icon name
        icon_to_use = request.icon or "help-circle"
        if not is_valid_icon(icon_to_use):
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid icon '{icon_to_use}'. Please use a valid Ionicons name (e.g., 'flask', 'globe', 'star', 'rocket')"
            )
        
        # Check if category already exists (case-insensitive)
        existing = await db.categories.find_one({"name": {"$regex": f"^{request.name}$", "$options": "i"}})
        if existing:
            raise HTTPException(status_code=400, detail=f"Category '{request.name}' already exists")
        
        category_id = f"cat_{uuid.uuid4().hex[:8]}"
        category_doc = {
            "category_id": category_id,
            "name": request.name,
            "icon": icon_to_use,
            "color": request.color or "#00FF87",
            "created_at": datetime.now(timezone.utc)
        }
        
        await db.categories.insert_one(category_doc)
        
        return {
            "success": True,
            "message": f"Category '{request.name}' added successfully",
            "category_id": category_id
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error adding category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Model for updating a category
class UpdateCategoryRequest(BaseModel):
    icon: Optional[str] = None
    color: Optional[str] = None

@api_router.patch("/admin/categories/{category_id}")
async def admin_update_category(
    category_id: str, 
    request: UpdateCategoryRequest, 
    _: bool = Depends(verify_admin_token)
):
    """Update a category's icon and/or color (admin only)"""
    try:
        # Find category
        category = await db.categories.find_one({"category_id": category_id})
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Build update dict
        update_fields = {}
        
        if request.icon is not None:
            # Validate icon
            if not is_valid_icon(request.icon):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid icon '{request.icon}'. Please use a valid Ionicons name."
                )
            update_fields["icon"] = request.icon
        
        if request.color is not None:
            # Basic color validation (hex format)
            color = request.color.strip()
            if not color.startswith("#") or len(color) not in [4, 7]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid color '{color}'. Please use hex format (e.g., '#FF5722')"
                )
            update_fields["color"] = color
        
        if not update_fields:
            raise HTTPException(status_code=400, detail="No fields to update. Provide 'icon' and/or 'color'.")
        
        # Update category
        await db.categories.update_one(
            {"category_id": category_id},
            {"$set": update_fields}
        )
        
        return {
            "success": True,
            "message": f"Category '{category['name']}' updated successfully",
            "updated_fields": list(update_fields.keys())
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error updating category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/admin/categories/{category_id}")
async def admin_delete_category(category_id: str, _: bool = Depends(verify_admin_token)):
    """Delete a category (admin only) - only if no playables use it"""
    try:
        # Find category
        category = await db.categories.find_one({"category_id": category_id})
        if not category:
            raise HTTPException(status_code=404, detail="Category not found")
        
        # Check if any playables use this category
        playable_count = await db.playables.count_documents({"category": category["name"]})
        if playable_count > 0:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete category '{category['name']}' - it has {playable_count} playable(s) using it"
            )
        
        await db.categories.delete_one({"category_id": category_id})
        
        return {"success": True, "message": f"Category '{category['name']}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Error deleting category: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/categories/init")
async def admin_init_categories(_: bool = Depends(verify_admin_token)):
    """Initialize categories from existing playables (admin only)"""
    try:
        # Get distinct categories from playables
        distinct_categories = await db.playables.distinct("category")
        
        added = []
        skipped = []
        
        for cat_name in distinct_categories:
            if not cat_name:
                continue
            
            # Check if already exists
            existing = await db.categories.find_one({"name": {"$regex": f"^{cat_name}$", "$options": "i"}})
            if existing:
                skipped.append(cat_name)
                continue
            
            # Get default style
            style = get_default_category_style(cat_name)
            
            category_doc = {
                "category_id": f"cat_{uuid.uuid4().hex[:8]}",
                "name": cat_name,
                "icon": style["icon"],
                "color": style["color"],
                "created_at": datetime.now(timezone.utc)
            }
            
            await db.categories.insert_one(category_doc)
            added.append(cat_name)
        
        return {
            "success": True,
            "message": f"Initialized {len(added)} categories",
            "added": added,
            "skipped": skipped
        }
    except Exception as e:
        logging.error(f"Error initializing categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/admin/categories/fix-icons")
async def admin_fix_category_icons(_: bool = Depends(verify_admin_token)):
    """Update all category icons to use the correct defaults (admin only)"""
    try:
        categories = await db.categories.find({}).to_list(100)
        updated = []
        
        for cat in categories:
            cat_name = cat.get("name", "")
            style = get_default_category_style(cat_name)
            
            # Update if icon is different or is help-circle (default)
            current_icon = cat.get("icon", "help-circle")
            new_icon = style["icon"]
            new_color = style["color"]
            
            if current_icon != new_icon or current_icon == "help-circle":
                await db.categories.update_one(
                    {"category_id": cat["category_id"]},
                    {"$set": {"icon": new_icon, "color": new_color}}
                )
                updated.append(f"{cat_name}: {current_icon} → {new_icon}")
        
        return {
            "success": True,
            "message": f"Updated {len(updated)} categories",
            "updated": updated
        }
    except Exception as e:
        logging.error(f"Error fixing category icons: {e}")
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
         "correct_answer": "Paris", "alternate_answers": "paris, Paree, paree", "answer_explanation": "Paris has been the capital of France since 987 AD and is known as the 'City of Light'.", "difficulty": "easy"},
        {"category": "Literature", "title": "Famous Authors", "question_text": "Who wrote 'Hamlet'?", 
         "correct_answer": "Shakespeare", "alternate_answers": "William Shakespeare, shakespear, Shakespear, W. Shakespeare", "answer_explanation": "William Shakespeare wrote Hamlet around 1600. It's considered one of the greatest plays ever written.", "difficulty": "medium"},
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
         "correct_answer": "Eiffel Tower", "alternate_answers": "eiffel tower, The Eiffel Tower, Tour Eiffel, Eiffel", "answer_explanation": "The Eiffel Tower was built in 1889 for the World's Fair and stands 330 meters tall in Paris.", "difficulty": "easy"},
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
         "correct_answer": "Piano", "alternate_answers": "piano, Grand Piano, grand piano, Keyboard", "answer_explanation": "The piano was invented around 1700 and is known for its wide range and expressive capabilities.", "difficulty": "easy"},
    ],
}

def get_template_columns(format_type: str) -> List[str]:
    """Get column headers for each format type"""
    base_cols = ["category", "title", "difficulty"]
    
    if format_type == "text_mcq":
        return base_cols + ["question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "text_input":
        return base_cols + ["question_text", "correct_answer", "alternate_answers", "answer_explanation"]
    elif format_type == "image_mcq":
        return base_cols + ["image_url", "question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "image_text_input":
        return base_cols + ["image_url", "question_text", "correct_answer", "alternate_answers", "answer_explanation"]
    elif format_type == "video_mcq":
        return base_cols + ["video_url", "question_text", "option_1", "option_2", "option_3", "option_4", "correct_answer", "answer_explanation"]
    elif format_type == "video_text_input":
        return base_cols + ["video_url", "question_text", "correct_answer", "alternate_answers", "answer_explanation"]
    else:
        return base_cols + ["question_text", "correct_answer", "alternate_answers", "answer_explanation"]

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
                
                # Validate category exists
                category_doc = await db.categories.find_one({"name": {"$regex": f"^{category}$", "$options": "i"}})
                if not category_doc:
                    errors.append(f"Row {idx}: Category '{category}' does not exist. Add it in the Categories tab first.")
                    continue
                
                # Use the exact category name from database
                validated_category = category_doc["name"]
                
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
                answer_explanation = row.get('answer_explanation', '').strip() or None
                
                # Parse alternate answers (comma-separated string to list)
                alternate_answers_str = row.get('alternate_answers', '').strip()
                alternate_answers = None
                if alternate_answers_str and answer_type == "text_input":
                    alternate_answers = [a.strip() for a in alternate_answers_str.split(',') if a.strip()]
                
                playable_doc = {
                    "playable_id": playable_id,
                    "type": playable_type,
                    "answer_type": answer_type,
                    "category": validated_category,  # Use validated category name
                    "title": title,
                    "question": question,
                    "options": options,
                    "correct_answer": correct_answer,
                    "alternate_answers": alternate_answers,
                    "answer_explanation": answer_explanation,
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

# ==================== API DOCUMENTATION ENDPOINT ====================
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║  IMPORTANT MAINTENANCE INSTRUCTION                                         ║
# ║  ─────────────────────────────────────────────────────────────────────────║
# ║  When adding NEW playable types/formats or modifying the API:              ║
# ║                                                                            ║
# ║  1. Update the "type" enum in playable_schema.required_fields              ║
# ║  2. Add new fields to optional_fields if applicable                        ║
# ║  3. Add example payload in example_payloads section                        ║
# ║  4. Update /app/API_TEMPLATE.md documentation                              ║
# ║  5. Increment the version number                                           ║
# ║                                                                            ║
# ║  This schema is consumed by external agents for API integration.           ║
# ║  Keeping it updated prevents integration errors.                           ║
# ╚═══════════════════════════════════════════════════════════════════════════╝

@api_router.get("/docs/schema")
async def get_api_schema():
    """
    Get API schema documentation for agents/programmatic consumption.
    
    MAINTENANCE: When adding new playable types or API changes:
    1. Update the enum values in this schema
    2. Add example payloads for new types
    3. Update /app/API_TEMPLATE.md
    4. Increment version number
    """
    return {
        "version": "1.0",
        "base_endpoints": {
            "admin_login": "POST /api/admin/login",
            "playables": {
                "list": "GET /api/admin/playables",
                "create": "POST /api/admin/add-playable",
                "update": "PUT /api/admin/playables/{playable_id}",
                "delete": "DELETE /api/admin/playables/{playable_id}"
            },
            "categories": {
                "list": "GET /api/admin/categories",
                "create": "POST /api/admin/categories",
                "update": "PATCH /api/admin/categories/{category_id}",
                "delete": "DELETE /api/admin/categories/{category_id}",
                "valid_icons": "GET /api/admin/valid-icons"
            }
        },
        "playable_schema": {
            "required_fields": {
                "type": {
                    "type": "string",
                    "enum": ["text", "image", "video", "image_text", "video_text", "guess_the_x", "chess_mate_in_2", "this_or_that"],
                    "description": "Type of playable content",
                    "type_descriptions": {
                        "text": "Text-only question",
                        "image": "Image-based question",
                        "video": "Video-based question",
                        "image_text": "Image with text question",
                        "video_text": "Video with text question",
                        "guess_the_x": "5 hints • Next hint revealed on wrong answer",
                        "chess_mate_in_2": "Chess puzzle - find mate in 2 moves",
                        "this_or_that": "Two images • Tap to select the correct one"
                    }
                },
                "answer_type": {
                    "type": "string",
                    "enum": ["mcq", "text_input", "tap_select"],
                    "description": "How user answers the question"
                },
                "category": {
                    "type": "string",
                    "description": "Must match an existing category name (case-sensitive)"
                },
                "title": {
                    "type": "string",
                    "description": "Display title for the playable"
                },
                "correct_answer": {
                    "type": "string",
                    "description": "The correct answer (for this_or_that: must match label_left or label_right)"
                }
            },
            "optional_fields": {
                "question_text": {
                    "type": "string",
                    "description": "The question text (NOT nested under 'question')"
                },
                "video_url": {
                    "type": "string",
                    "description": "URL to video - MP4 or YouTube (NOT nested under 'question')"
                },
                "video_start": {
                    "type": "integer",
                    "description": "Start time in seconds for YouTube clips"
                },
                "video_end": {
                    "type": "integer",
                    "description": "End time in seconds for YouTube clips"
                },
                "image_url": {
                    "type": "string",
                    "description": "URL to image or base64 data URL (NOT nested under 'question')"
                },
                "image_left_url": {
                    "type": "string",
                    "description": "Left image URL (for this_or_that only)"
                },
                "image_right_url": {
                    "type": "string",
                    "description": "Right image URL (for this_or_that only)"
                },
                "label_left": {
                    "type": "string",
                    "description": "Label for left image - used for answer matching (for this_or_that only)"
                },
                "label_right": {
                    "type": "string",
                    "description": "Label for right image - used for answer matching (for this_or_that only)"
                },
                "options": {
                    "type": "array",
                    "items": "string",
                    "description": "4 options for MCQ (required when answer_type is 'mcq')"
                },
                "alternate_answers": {
                    "type": "array",
                    "items": "string",
                    "description": "Alternative accepted answers for text_input"
                },
                "answer_explanation": {
                    "type": "string",
                    "description": "Explanation shown after answering"
                },
                "hints": {
                    "type": "array",
                    "items": "string",
                    "description": "3-5 progressive hints (for guess_the_x only)"
                },
                "fen": {
                    "type": "string",
                    "description": "Chess position in FEN notation (for chess_mate_in_2 only)"
                },
                "solution": {
                    "type": "array",
                    "items": "string",
                    "description": "Chess moves in UCI format (for chess_mate_in_2 only)"
                },
                "difficulty": {
                    "type": "string",
                    "enum": ["easy", "medium", "hard"],
                    "default": "medium"
                }
            }
        },
        "category_schema": {
            "create": {
                "name": {"type": "string", "required": True},
                "icon": {"type": "string", "required": False, "default": "help-circle", "description": "Valid Ionicons name"},
                "color": {"type": "string", "required": False, "default": "#00FF87", "description": "Hex color (#RGB or #RRGGBB)"}
            },
            "update": {
                "icon": {"type": "string", "required": False},
                "color": {"type": "string", "required": False}
            }
        },
        "important_notes": [
            "Use FLAT fields (question_text, video_url) NOT nested objects (question: {text, video_url})",
            "Category names are case-sensitive and must exist before creating playables",
            "Icons must be valid Ionicons names - check /api/admin/valid-icons",
            "All admin endpoints require Authorization: Bearer <admin_token> header"
        ],
        "example_payloads": {
            "text_mcq": {
                "type": "text",
                "answer_type": "mcq",
                "category": "SCIENCE",
                "title": "Chemistry Basics",
                "question_text": "What is the chemical symbol for Gold?",
                "options": ["Au", "Ag", "Fe", "Cu"],
                "correct_answer": "Au",
                "difficulty": "easy"
            },
            "video_mcq": {
                "type": "video",
                "answer_type": "mcq",
                "category": "MATHS",
                "title": "Math Puzzle",
                "question_text": "Solve this!",
                "video_url": "https://example.com/video.mp4",
                "options": ["7", "14", "10", "24"],
                "correct_answer": "7",
                "difficulty": "medium"
            },
            "guess_the_x": {
                "type": "guess_the_x",
                "answer_type": "text_input",
                "category": "MOVIES",
                "title": "Guess the Movie",
                "question_text": "Guess from these hints",
                "hints": ["Hint 1", "Hint 2", "Hint 3", "Hint 4", "Hint 5"],
                "correct_answer": "The Answer",
                "alternate_answers": ["answer", "the answer"],
                "difficulty": "medium"
            },
            "this_or_that": {
                "type": "this_or_that",
                "answer_type": "tap_select",
                "category": "GENERAL",
                "title": "Logo Recognition",
                "question_text": "Which is the Apple logo?",
                "image_left_url": "https://example.com/apple-logo.png",
                "image_right_url": "https://example.com/samsung-logo.png",
                "label_left": "Apple",
                "label_right": "Samsung",
                "correct_answer": "Apple",
                "difficulty": "easy"
            }
        }
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

@app.on_event("startup")
async def startup_db_client():
    """Create indexes for optimized queries"""
    try:
        # Index for variety-based feed query (user_progress lookup)
        await db.user_progress.create_index([("user_id", 1), ("playable_id", 1)])
        # Index for playable queries
        await db.playables.create_index([("category", 1)])
        await db.playables.create_index([("playable_id", 1)])
        logging.info("Database indexes created successfully")
    except Exception as e:
        logging.error(f"Error creating indexes: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
