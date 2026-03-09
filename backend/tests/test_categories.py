"""
Backend API Tests for Category Selection and Editing Feature
Tests:
- POST /api/categories/select - save user's category preferences (min 3)
- GET /api/categories - return categories with descriptions  
- PATCH /api/admin/categories/{id} - allow updating description field
- Admin login and authentication flow
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://playable-deploy.preview.emergentagent.com')

# Admin credentials
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "@dm!n!spl@ying"


class TestAdminAuth:
    """Test admin authentication"""
    
    def test_admin_login_success(self):
        """Admin login should succeed with correct credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "token" in data, "Response should contain token"
        assert data["success"] == True, "Success should be True"
        print(f"✅ Admin login successful, token: {data['token'][:30]}...")
        
    def test_admin_login_invalid_credentials(self):
        """Admin login should fail with wrong credentials"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": "wrong", "password": "wrongpass"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Admin login correctly rejected invalid credentials")


class TestCategoriesPublicEndpoint:
    """Test public categories endpoints"""
    
    def test_categories_list_public(self):
        """GET /api/categories/list should return category names without auth"""
        response = requests.get(f"{BASE_URL}/api/categories/list")
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "categories" in data, "Response should contain categories"
        assert isinstance(data["categories"], list), "Categories should be a list"
        assert len(data["categories"]) > 0, "Should have at least one category"
        print(f"✅ Categories list returned {len(data['categories'])} categories: {data['categories'][:5]}...")


class TestCategoriesAuthenticatedEndpoint:
    """Test authenticated categories endpoint with descriptions"""
    
    @pytest.fixture
    def session_token(self):
        """Get a session token via dev login"""
        response = requests.post(f"{BASE_URL}/api/auth/dev-login")
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Dev login not available")
        
    def test_get_categories_with_auth(self, session_token):
        """GET /api/categories should return categories with descriptions when authenticated"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert "categories" in data, "Response should contain categories"
        
        categories = data["categories"]
        assert isinstance(categories, list), "Categories should be a list"
        assert len(categories) > 0, "Should have at least one category"
        
        # Check category structure - should have name, icon, color, and optionally description
        first_cat = categories[0]
        assert "name" in first_cat, "Category should have name"
        assert "icon" in first_cat, "Category should have icon"
        assert "color" in first_cat, "Category should have color"
        assert "category_id" in first_cat, "Category should have category_id"
        
        # Check if any category has description
        has_description = any(cat.get("description") for cat in categories)
        print(f"✅ Categories endpoint returned {len(categories)} categories")
        print(f"   Sample: {first_cat}")
        print(f"   Has descriptions: {has_description}")
        
    def test_get_categories_without_auth(self):
        """GET /api/categories should require authentication"""
        response = requests.get(f"{BASE_URL}/api/categories")
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}: {response.text}"
        print("✅ Categories endpoint correctly requires authentication")


class TestCategorySelection:
    """Test category selection endpoint"""
    
    @pytest.fixture
    def session_token(self):
        """Get a session token via dev login"""
        response = requests.post(f"{BASE_URL}/api/auth/dev-login")
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Dev login not available")
    
    @pytest.fixture
    def available_categories(self, session_token):
        """Get available categories"""
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        if response.status_code == 200:
            return [c["name"] for c in response.json().get("categories", [])]
        return ["Sports", "History", "Geography", "Science", "Music"]
        
    def test_select_categories_success(self, session_token, available_categories):
        """POST /api/categories/select should save categories when selecting 3 or more"""
        # Select at least 3 categories
        selected = available_categories[:3] if len(available_categories) >= 3 else ["Sports", "History", "Geography"]
        
        response = requests.post(
            f"{BASE_URL}/api/categories/select",
            json={"categories": selected},
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        assert "selected_categories" in data, "Response should contain selected_categories"
        assert data["selected_categories"] == selected, "Selected categories should match"
        print(f"✅ Category selection successful: {selected}")
        
    def test_select_categories_minimum_3(self, session_token, available_categories):
        """POST /api/categories/select should reject less than 3 categories"""
        # Try selecting only 2 categories
        selected = available_categories[:2] if len(available_categories) >= 2 else ["Sports", "History"]
        
        response = requests.post(
            f"{BASE_URL}/api/categories/select",
            json={"categories": selected},
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "detail" in data, "Should have error detail"
        assert "3" in data["detail"].lower() or "least" in data["detail"].lower(), \
            f"Error message should mention 3 category minimum: {data['detail']}"
        print(f"✅ Correctly rejected selection with <3 categories: {data['detail']}")
        
    def test_select_categories_empty(self, session_token):
        """POST /api/categories/select should reject empty selection"""
        response = requests.post(
            f"{BASE_URL}/api/categories/select",
            json={"categories": []},
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print("✅ Correctly rejected empty category selection")
        
    def test_select_categories_without_auth(self):
        """POST /api/categories/select should require authentication"""
        response = requests.post(
            f"{BASE_URL}/api/categories/select",
            json={"categories": ["Sports", "History", "Geography"]}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Category selection correctly requires authentication")


class TestAdminCategoryUpdate:
    """Test admin category update endpoint with description field"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token"""
        response = requests.post(
            f"{BASE_URL}/api/admin/login",
            json={"username": ADMIN_USERNAME, "password": ADMIN_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("token")
        pytest.skip("Admin login failed")
        
    @pytest.fixture
    def category_id(self, admin_token):
        """Get first category ID for testing"""
        # Get user token first to fetch categories
        dev_response = requests.post(f"{BASE_URL}/api/auth/dev-login")
        if dev_response.status_code != 200:
            pytest.skip("Dev login not available")
        session_token = dev_response.json().get("session_token")
        
        response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        if response.status_code == 200:
            categories = response.json().get("categories", [])
            if categories:
                return categories[0]["category_id"]
        pytest.skip("No categories available")
        
    def test_update_category_description(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should update description"""
        test_description = f"Test description added at {uuid.uuid4().hex[:8]}"
        
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"description": test_description},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        assert "description" in data.get("updated_fields", []), "description should be in updated_fields"
        print(f"✅ Category description updated successfully")
        
    def test_update_category_icon(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should update icon"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"icon": "globe"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        assert "icon" in data.get("updated_fields", []), "icon should be in updated_fields"
        print(f"✅ Category icon updated successfully")
        
    def test_update_category_color(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should update color"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"color": "#FF5722"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        assert "color" in data.get("updated_fields", []), "color should be in updated_fields"
        print(f"✅ Category color updated successfully")
        
    def test_update_category_multiple_fields(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should update multiple fields at once"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={
                "icon": "star",
                "color": "#00FF87",
                "description": "Updated with multiple fields"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        updated = data.get("updated_fields", [])
        assert "icon" in updated and "color" in updated and "description" in updated, \
            f"All fields should be updated: {updated}"
        print(f"✅ Multiple category fields updated successfully")
        
    def test_update_category_clear_description(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should clear description with empty string"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"description": ""},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data["success"] == True, "Success should be True"
        print(f"✅ Category description cleared successfully")
        
    def test_update_category_invalid_icon(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should reject invalid icon"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"icon": "invalid-nonexistent-icon"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✅ Invalid icon correctly rejected")
        
    def test_update_category_invalid_color(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should reject invalid color"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"color": "not-a-color"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✅ Invalid color correctly rejected")
        
    def test_update_category_not_found(self, admin_token):
        """PATCH /api/admin/categories/{id} should return 404 for non-existent category"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/nonexistent_category_id_12345",
            json={"description": "Test"},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 404, f"Expected 404, got {response.status_code}: {response.text}"
        print(f"✅ Non-existent category correctly returns 404")
        
    def test_update_category_no_fields(self, admin_token, category_id):
        """PATCH /api/admin/categories/{id} should reject request with no update fields"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        print(f"✅ Empty update request correctly rejected")
        
    def test_update_category_without_auth(self, category_id):
        """PATCH /api/admin/categories/{id} should require admin authentication"""
        response = requests.patch(
            f"{BASE_URL}/api/admin/categories/{category_id}",
            json={"description": "Test"}
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print(f"✅ Category update correctly requires admin authentication")


class TestUserOnboardingStatus:
    """Test user onboarding_complete and selected_categories fields"""
    
    @pytest.fixture
    def session_token(self):
        """Get a session token via dev login"""
        response = requests.post(f"{BASE_URL}/api/auth/dev-login")
        if response.status_code == 200:
            return response.json().get("session_token")
        pytest.skip("Dev login not available")
        
    def test_user_has_onboarding_fields(self, session_token):
        """GET /api/auth/me should return user with onboarding fields"""
        response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        
        # Check for onboarding-related fields
        assert "onboarding_complete" in data, "User should have onboarding_complete field"
        # selected_categories may be None for new users
        assert "selected_categories" in data or data.get("selected_categories") is None, \
            "User should have selected_categories field (can be None)"
        
        print(f"✅ User has onboarding fields:")
        print(f"   onboarding_complete: {data.get('onboarding_complete')}")
        print(f"   selected_categories: {data.get('selected_categories')}")
        
    def test_onboarding_complete_after_selection(self, session_token):
        """After selecting categories, onboarding_complete should be True"""
        # First get available categories
        cat_response = requests.get(
            f"{BASE_URL}/api/categories",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        categories = [c["name"] for c in cat_response.json().get("categories", [])][:3]
        
        # Select categories
        select_response = requests.post(
            f"{BASE_URL}/api/categories/select",
            json={"categories": categories},
            headers={"Authorization": f"Bearer {session_token}"}
        )
        assert select_response.status_code == 200
        
        # Check user status
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {session_token}"}
        )
        
        assert me_response.status_code == 200
        data = me_response.json()
        assert data["onboarding_complete"] == True, "onboarding_complete should be True after selection"
        assert data["selected_categories"] == categories, "selected_categories should match"
        print(f"✅ User onboarding_complete is True after category selection")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
