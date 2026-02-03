# Developer Notes - DubDub App

## 🔴 CRITICAL: Adding New Playable Formats

**When adding a NEW playable type/format, you MUST do ALL of the following:**

### 1. Backend Updates (`/app/backend/server.py`)
- [ ] Add type to `AddPlayableRequest` model
- [ ] Add validation in `add-playable` endpoint
- [ ] Update `get_api_schema()` function - add to enum, add fields, add example
- [ ] Update `/api/playable-types` endpoint with new type + description
- [ ] Update `/api/admin/template-formats` endpoint

### 2. Frontend Updates (`/app/frontend/components/PlayableCard.tsx`)
- [ ] Add rendering logic for new type
- [ ] **CRITICAL: Use consistent header UI** (see checklist below)
- [ ] Handle answer submission via `onAnswer(answer, isCorrect)`

### 3. Documentation Updates
- [ ] Update `/app/API_TEMPLATE.md` with example payload
- [ ] Update `/app/DEVELOPER_NOTES.md` if needed

---

## 🔴 CRITICAL: UI Consistency Checklist for New Formats

**Every format MUST have consistent header UI:**

```jsx
// REQUIRED: Category badge (left) + Progress badge (right)
<View style={styles.topRowStandard}>
  <View style={styles.categoryBadge}>
    <Text style={styles.categoryText}>{playable.category}</Text>
  </View>
  {totalCount > 0 && (
    <View style={styles.standardProgressBadge}>
      <Text style={styles.standardProgressText}>
        {currentIndex + 1} / {totalCount}
      </Text>
    </View>
  )}
</View>
```

**DO NOT:**
- ❌ Create custom category badge styles
- ❌ Skip the progress indicator
- ❌ Use different colors/fonts for category

**DO:**
- ✅ Use `styles.categoryBadge` and `styles.categoryText`
- ✅ Use `styles.standardProgressBadge` and `styles.standardProgressText`
- ✅ Pass `currentIndex` and `totalCount` props

---

## API Schema Maintenance

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
