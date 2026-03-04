#!/usr/bin/env python3
"""
Script to add chess puzzles from Lichess dataset to the playables database.

Usage:
    python add_chess_puzzles.py [--count N] [--themes THEMES]
    
Examples:
    python add_chess_puzzles.py --count 10
    python add_chess_puzzles.py --count 5 --themes mateIn1,mateIn2
"""

import os
import sys
import argparse
import asyncio
from datetime import datetime, timezone
from typing import List, Optional

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from datasets import load_dataset

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")

# Themes we're interested in (mate puzzles)
MATE_THEMES = ["mateIn1", "mateIn2", "mateIn3"]

# Difficulty mapping based on mate theme
DIFFICULTY_MAP = {
    "mateIn1": "easy",
    "mateIn2": "medium", 
    "mateIn3": "hard"
}

# Title mapping
TITLE_MAP = {
    "mateIn1": "Mate in 1",
    "mateIn2": "Mate in 2",
    "mateIn3": "Mate in 3"
}


def get_mate_theme(themes: List[str]) -> Optional[str]:
    """Extract the mate theme from a list of themes."""
    for theme in themes:
        if theme in MATE_THEMES:
            return theme
    return None


def transform_puzzle_to_playable(puzzle: dict, mate_theme: str) -> dict:
    """
    Transform a Lichess puzzle to our playable format.
    
    Lichess format:
    - FEN: Position BEFORE opponent's move
    - Moves: "opponent_move player_move opponent_move player_move ..." (space-separated UCI)
    
    Our format:
    - fen: Same FEN
    - solution: Array of moves [opponent_move, player_move, ...] in UCI format
    """
    # Parse moves from space-separated string to array
    moves_str = puzzle["Moves"]
    solution = moves_str.split()
    
    return {
        "playable_id": f"chess_{puzzle['PuzzleId']}",
        "title": TITLE_MAP.get(mate_theme, "Chess Puzzle"),
        "content_type": "chess_puzzle",
        "answer_type": "interactive",
        "category": "Chess",
        "fen": puzzle["FEN"],
        "solution": solution,
        "difficulty": DIFFICULTY_MAP.get(mate_theme, "medium"),
        "lichess_rating": puzzle["Rating"],
        "lichess_themes": puzzle["Themes"],
        "lichess_puzzle_id": puzzle["PuzzleId"],
        "weight": 0,  # Default weight for feed ordering
        "created_at": datetime.now(timezone.utc),
    }


async def add_puzzles(count: int = 10, themes: Optional[List[str]] = None):
    """
    Add chess puzzles to the database.
    
    Args:
        count: Number of puzzles to add
        themes: List of themes to filter by (default: all mate themes)
    """
    if themes is None:
        themes = MATE_THEMES
    
    print(f"Loading Lichess chess puzzles dataset...")
    print(f"Filtering for themes: {themes}")
    print(f"Target count: {count}")
    
    # Load dataset (streaming to avoid downloading entire dataset)
    dataset = load_dataset("Lichess/chess-puzzles", split="train", streaming=True)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(MONGO_URL)
    db = client.playables_db
    
    puzzles_to_add = []
    puzzles_per_theme = {theme: 0 for theme in themes}
    target_per_theme = count // len(themes) + 1
    
    print(f"\nSearching for puzzles...")
    
    # Iterate through dataset and collect matching puzzles
    for puzzle in dataset:
        puzzle_themes = puzzle.get("Themes", [])
        mate_theme = get_mate_theme(puzzle_themes)
        
        if mate_theme and mate_theme in themes:
            # Check if we need more of this theme
            if puzzles_per_theme[mate_theme] < target_per_theme:
                # Check if puzzle already exists
                existing = await db.playables.find_one({"playable_id": f"chess_{puzzle['PuzzleId']}"})
                if not existing:
                    playable = transform_puzzle_to_playable(puzzle, mate_theme)
                    puzzles_to_add.append(playable)
                    puzzles_per_theme[mate_theme] += 1
                    print(f"  Found: {playable['title']} (Rating: {puzzle['Rating']}, ID: {puzzle['PuzzleId']})")
        
        # Check if we have enough puzzles
        if len(puzzles_to_add) >= count:
            break
    
    if not puzzles_to_add:
        print("\nNo new puzzles to add.")
        return
    
    # Insert puzzles into database
    print(f"\nInserting {len(puzzles_to_add)} puzzles into database...")
    result = await db.playables.insert_many(puzzles_to_add)
    print(f"Successfully inserted {len(result.inserted_ids)} puzzles!")
    
    # Print summary
    print("\n=== Summary ===")
    for theme, count in puzzles_per_theme.items():
        print(f"  {TITLE_MAP.get(theme, theme)}: {count} puzzles")
    
    print("\nPuzzles added:")
    for p in puzzles_to_add:
        print(f"  - {p['playable_id']}: {p['title']} ({p['difficulty']})")


async def main():
    parser = argparse.ArgumentParser(description="Add chess puzzles from Lichess dataset")
    parser.add_argument("--count", type=int, default=10, help="Number of puzzles to add (default: 10)")
    parser.add_argument("--themes", type=str, default=None, 
                       help=f"Comma-separated themes to filter (default: {','.join(MATE_THEMES)})")
    
    args = parser.parse_args()
    
    themes = None
    if args.themes:
        themes = [t.strip() for t in args.themes.split(",")]
    
    await add_puzzles(count=args.count, themes=themes)


if __name__ == "__main__":
    asyncio.run(main())
