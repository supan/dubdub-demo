# Developer Notes - DubDub App

## 🔴 CRITICAL: API Schema Maintenance

**When adding NEW playable types, formats, or API fields:**

### Required Updates:
1. **Backend Schema API** (`/app/backend/server.py`)
   - Look for `# ==================== API DOCUMENTATION ENDPOINT ====================`
   - Update the `get_api_schema()` function
   - Add new type to enum, add new fields, add example payload
   - Increment version number

2. **API Documentation** (`/app/API_TEMPLATE.md`)
   - Update field tables
   - Add example payloads
   - Update "Valid Playable Types" section

### Why This Matters:
The schema API at `GET /api/docs/schema` is consumed by external agents/systems for API integration. Outdated schema = integration failures.

---

## Key Architecture Decisions

### Flat vs Nested Fields
The API uses **FLAT fields** for input but stores as **nested objects** in DB:

| API Request (FLAT) | Database Storage (NESTED) |
|-------------------|---------------------------|
| `question_text` | `question.text` |
| `video_url` | `question.video_url` |
| `image_url` | `question.image_url` |

**Never send nested `question: {}` object in API requests!**

### Icon Validation
- Icons are validated against `VALID_IONICONS` set in server.py (276 icons)
- Frontend uses icons directly from database via `getValidIcon()` helper
- No hardcoded icon mapping needed

### Category Management
- Categories are centrally managed in `categories` collection
- All playables must reference existing categories
- Icons/colors stored in database, not hardcoded

---

## File Locations

| Purpose | File |
|---------|------|
| Backend API | `/app/backend/server.py` |
| API Schema Endpoint | `GET /api/docs/schema` |
| API Documentation | `/app/API_TEMPLATE.md` |
| Icon Validation | `VALID_IONICONS` in server.py |
| Category Management | `/admin/categories` endpoints |

---

## Testing Credentials

| Resource | Credentials |
|----------|-------------|
| Admin Dashboard | Username: `admin`, Password: `@dm!n!spl@ying` |
| Dev Login | Green "Dev Login" button on login screen |

---

## Common Issues & Solutions

### "Play Again" not working
- The button must call `DELETE /api/user/reset-progress` to clear backend progress
- Local state reset alone is insufficient

### Icons not showing
- Ensure icon name is valid Ionicons name
- Check `GET /api/admin/valid-icons` for valid names
- Frontend falls back to `help-circle` for invalid icons

### Update API returning success but data not persisting
- Check you're using FLAT fields, not nested
- The `question` object is MERGED, not replaced (for updates)
