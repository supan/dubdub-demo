"""
Migration Script: Add 'status' field to all playables

Run this script on production to add status='active' to all existing playables.

Usage:
    python migrate_status_field.py <MONGO_URL>
    
Example:
    python migrate_status_field.py "mongodb+srv://user:pass@cluster.mongodb.net/dbname"
"""

import asyncio
import sys
from motor.motor_asyncio import AsyncIOMotorClient

async def migrate(mongo_url: str):
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(mongo_url)
    
    # Extract database name from URL or use default
    db_name = mongo_url.split('/')[-1].split('?')[0] if '/' in mongo_url else "test_database"
    if not db_name or db_name == "":
        db_name = "test_database"
    
    db = client[db_name]
    print(f"Using database: {db_name}")
    
    # Create index on status field
    try:
        await db.playables.create_index("status")
        print("✓ Created index on 'status' field")
    except Exception as e:
        print(f"Index may already exist: {e}")
    
    # Count playables without status field
    without_status = await db.playables.count_documents({"status": {"$exists": False}})
    print(f"Found {without_status} playables without status field")
    
    # Update all playables without status to have status="active"
    if without_status > 0:
        result = await db.playables.update_many(
            {"status": {"$exists": False}},
            {"$set": {"status": "active"}}
        )
        print(f"✓ Updated {result.modified_count} playables with status='active'")
    else:
        print("No migration needed - all playables already have status field")
    
    # Verify
    total = await db.playables.count_documents({})
    active = await db.playables.count_documents({"status": "active"})
    inactive = await db.playables.count_documents({"status": "inactive"})
    no_status = await db.playables.count_documents({"status": {"$exists": False}})
    
    print(f"\n=== Migration Summary ===")
    print(f"Total playables: {total}")
    print(f"Active: {active}")
    print(f"Inactive: {inactive}")
    print(f"Without status: {no_status}")
    
    client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python migrate_status_field.py <MONGO_URL>")
        print("Example: python migrate_status_field.py 'mongodb+srv://user:pass@cluster.mongodb.net/dbname'")
        sys.exit(1)
    
    mongo_url = sys.argv[1]
    asyncio.run(migrate(mongo_url))
