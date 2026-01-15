#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Playable Feed App
Tests authentication, playables feed, answer submission, and user stats
"""

import requests
import json
import time
import os
from datetime import datetime, timezone, timedelta
import subprocess
import sys

# Get backend URL from frontend .env
BACKEND_URL = "https://puzzlerly.preview.emergentagent.com/api"

class BackendTester:
    def __init__(self):
        self.session_token = None
        self.user_id = None
        self.test_results = {
            "auth_session": {"status": "pending", "details": []},
            "auth_me": {"status": "pending", "details": []},
            "auth_logout": {"status": "pending", "details": []},
            "playables_feed": {"status": "pending", "details": []},
            "answer_submission": {"status": "pending", "details": []},
            "user_stats": {"status": "pending", "details": []},
            "streak_tracking": {"status": "pending", "details": []}
        }
        
    def log_result(self, test_name, success, message, details=None):
        """Log test result"""
        status = "pass" if success else "fail"
        self.test_results[test_name]["status"] = status
        self.test_results[test_name]["details"].append({
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
        print(f"[{status.upper()}] {test_name}: {message}")
        if details:
            print(f"  Details: {details}")
    
    def create_test_user_and_session(self):
        """Create test user and session in MongoDB"""
        try:
            timestamp = int(time.time())
            self.user_id = f"user_{timestamp}"
            self.session_token = f"test_session_{timestamp}"
            
            # Create MongoDB commands
            mongo_commands = f"""
use('test_database');
db.users.insertOne({{
  user_id: '{self.user_id}',
  email: 'test.user.{timestamp}@example.com',
  name: 'Test User {timestamp}',
  picture: 'https://via.placeholder.com/150',
  total_played: 0,
  correct_answers: 0,
  current_streak: 0,
  best_streak: 0,
  created_at: new Date()
}});
db.user_sessions.insertOne({{
  user_id: '{self.user_id}',
  session_token: '{self.session_token}',
  expires_at: new Date(Date.now() + 7*24*60*60*1000),
  created_at: new Date()
}});
print('Test user and session created successfully');
"""
            
            # Execute MongoDB commands
            result = subprocess.run(
                ["mongosh", "--eval", mongo_commands],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                print(f"✅ Test user created: {self.user_id}")
                print(f"✅ Session token: {self.session_token}")
                return True
            else:
                print(f"❌ Failed to create test user: {result.stderr}")
                return False
                
        except Exception as e:
            print(f"❌ Error creating test user: {e}")
            return False
    
    def test_auth_session_endpoint(self):
        """Test /api/auth/session endpoint - Note: This requires Emergent Auth integration"""
        try:
            # This endpoint requires X-Session-ID from Emergent Auth
            # Since we can't test the full OAuth flow, we'll test the endpoint structure
            response = requests.post(
                f"{BACKEND_URL}/auth/session",
                headers={"X-Session-ID": "test_session_id"},
                timeout=10
            )
            
            # We expect this to fail with 401 since we don't have a real Emergent session
            if response.status_code == 401:
                self.log_result("auth_session", True, 
                    "Session endpoint correctly rejects invalid session_id", 
                    {"status_code": response.status_code, "response": response.text})
            elif response.status_code == 400:
                self.log_result("auth_session", True,
                    "Session endpoint correctly validates X-Session-ID header",
                    {"status_code": response.status_code, "response": response.text})
            else:
                self.log_result("auth_session", False,
                    f"Unexpected response from session endpoint: {response.status_code}",
                    {"response": response.text})
                
        except requests.exceptions.Timeout:
            self.log_result("auth_session", False, "Session endpoint timeout")
        except Exception as e:
            self.log_result("auth_session", False, f"Session endpoint error: {e}")
    
    def test_auth_me_endpoint(self):
        """Test /api/auth/me endpoint"""
        try:
            # Test without authorization
            response = requests.get(f"{BACKEND_URL}/auth/me", timeout=10)
            if response.status_code == 401:
                self.log_result("auth_me", True, 
                    "Auth/me correctly rejects requests without authorization")
            else:
                self.log_result("auth_me", False,
                    f"Auth/me should return 401 without auth, got {response.status_code}")
                return
            
            # Test with valid authorization
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.get(f"{BACKEND_URL}/auth/me", headers=headers, timeout=10)
            
            if response.status_code == 200:
                user_data = response.json()
                required_fields = ["user_id", "email", "name", "total_played", "correct_answers", "current_streak", "best_streak"]
                
                if all(field in user_data for field in required_fields):
                    self.log_result("auth_me", True,
                        "Auth/me returns complete user data",
                        {"user_data": user_data})
                else:
                    missing_fields = [f for f in required_fields if f not in user_data]
                    self.log_result("auth_me", False,
                        f"Auth/me missing required fields: {missing_fields}",
                        {"user_data": user_data})
            else:
                self.log_result("auth_me", False,
                    f"Auth/me failed with status {response.status_code}",
                    {"response": response.text})
                
        except Exception as e:
            self.log_result("auth_me", False, f"Auth/me error: {e}")
    
    def test_auth_logout_endpoint(self):
        """Test /api/auth/logout endpoint"""
        try:
            # Test without authorization
            response = requests.post(f"{BACKEND_URL}/auth/logout", timeout=10)
            if response.status_code == 400:
                self.log_result("auth_logout", True,
                    "Logout correctly rejects requests without authorization header")
            else:
                self.log_result("auth_logout", False,
                    f"Logout should return 400 without auth header, got {response.status_code}")
                return
            
            # Test with valid authorization
            headers = {"Authorization": f"Bearer {self.session_token}"}
            response = requests.post(f"{BACKEND_URL}/auth/logout", headers=headers, timeout=10)
            
            if response.status_code == 200:
                result = response.json()
                if "message" in result:
                    self.log_result("auth_logout", True,
                        "Logout successful",
                        {"response": result})
                else:
                    self.log_result("auth_logout", False,
                        "Logout response missing message field",
                        {"response": result})
            else:
                self.log_result("auth_logout", False,
                    f"Logout failed with status {response.status_code}",
                    {"response": response.text})
                
        except Exception as e:
            self.log_result("auth_logout", False, f"Logout error: {e}")
    
    def test_playables_feed(self):
        """Test /api/playables/feed endpoint"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # Test basic feed request
            response = requests.get(f"{BACKEND_URL}/playables/feed", headers=headers, timeout=10)
            
            if response.status_code == 200:
                playables = response.json()
                
                if isinstance(playables, list):
                    self.log_result("playables_feed", True,
                        f"Feed returns {len(playables)} playables",
                        {"count": len(playables), "sample": playables[0] if playables else None})
                    
                    # Verify playable structure
                    if playables:
                        required_fields = ["playable_id", "type", "answer_type", "category", "title", "question", "correct_answer"]
                        sample_playable = playables[0]
                        
                        if all(field in sample_playable for field in required_fields):
                            self.log_result("playables_feed", True,
                                "Playables have correct structure")
                        else:
                            missing_fields = [f for f in required_fields if f not in sample_playable]
                            self.log_result("playables_feed", False,
                                f"Playables missing required fields: {missing_fields}")
                    
                    # Test pagination
                    response_paginated = requests.get(
                        f"{BACKEND_URL}/playables/feed?skip=0&limit=2", 
                        headers=headers, 
                        timeout=10
                    )
                    
                    if response_paginated.status_code == 200:
                        paginated_playables = response_paginated.json()
                        if len(paginated_playables) <= 2:
                            self.log_result("playables_feed", True,
                                "Pagination works correctly",
                                {"requested_limit": 2, "returned_count": len(paginated_playables)})
                        else:
                            self.log_result("playables_feed", False,
                                f"Pagination failed: requested 2, got {len(paginated_playables)}")
                    
                else:
                    self.log_result("playables_feed", False,
                        "Feed should return a list",
                        {"response_type": type(playables)})
            else:
                self.log_result("playables_feed", False,
                    f"Feed failed with status {response.status_code}",
                    {"response": response.text})
                
        except Exception as e:
            self.log_result("playables_feed", False, f"Feed error: {e}")
    
    def test_answer_submission_and_streak_tracking(self):
        """Test answer submission and streak tracking logic"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            # First, get a playable to answer
            response = requests.get(f"{BACKEND_URL}/playables/feed?limit=3", headers=headers, timeout=10)
            
            if response.status_code != 200:
                self.log_result("answer_submission", False, "Could not get playables for testing")
                return
            
            playables = response.json()
            if not playables:
                self.log_result("answer_submission", False, "No playables available for testing")
                return
            
            # Test correct answer (should increase streak)
            playable = playables[0]
            playable_id = playable["playable_id"]
            correct_answer = playable["correct_answer"]
            
            answer_data = {"answer": correct_answer}
            response = requests.post(
                f"{BACKEND_URL}/playables/{playable_id}/answer",
                headers=headers,
                json=answer_data,
                timeout=10
            )
            
            if response.status_code == 200:
                result = response.json()
                required_fields = ["correct", "correct_answer", "current_streak", "best_streak", "total_played", "correct_answers"]
                
                if all(field in result for field in required_fields):
                    if result["correct"] == True and result["current_streak"] >= 1:
                        self.log_result("answer_submission", True,
                            "Correct answer submission works",
                            {"result": result})
                        self.log_result("streak_tracking", True,
                            f"Streak increased to {result['current_streak']} on correct answer")
                    else:
                        self.log_result("answer_submission", False,
                            "Correct answer not properly recognized",
                            {"result": result})
                else:
                    missing_fields = [f for f in required_fields if f not in result]
                    self.log_result("answer_submission", False,
                        f"Answer response missing fields: {missing_fields}",
                        {"result": result})
            else:
                self.log_result("answer_submission", False,
                    f"Answer submission failed with status {response.status_code}",
                    {"response": response.text})
                return
            
            # Test incorrect answer (should reset streak to 0)
            if len(playables) > 1:
                playable2 = playables[1]
                playable_id2 = playable2["playable_id"]
                
                # Submit wrong answer
                wrong_answer_data = {"answer": "definitely_wrong_answer"}
                response = requests.post(
                    f"{BACKEND_URL}/playables/{playable_id2}/answer",
                    headers=headers,
                    json=wrong_answer_data,
                    timeout=10
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result["correct"] == False and result["current_streak"] == 0:
                        self.log_result("streak_tracking", True,
                            "Streak correctly reset to 0 on incorrect answer",
                            {"result": result})
                    else:
                        self.log_result("streak_tracking", False,
                            "Streak not properly reset on incorrect answer",
                            {"result": result})
                else:
                    self.log_result("answer_submission", False,
                        f"Wrong answer submission failed with status {response.status_code}")
            
            # Test duplicate answer (should fail or be handled gracefully)
            duplicate_response = requests.post(
                f"{BACKEND_URL}/playables/{playable_id}/answer",
                headers=headers,
                json=answer_data,
                timeout=10
            )
            
            # The API should handle duplicate answers gracefully
            if duplicate_response.status_code in [200, 400, 409]:
                self.log_result("answer_submission", True,
                    f"Duplicate answer handled appropriately (status: {duplicate_response.status_code})")
            else:
                self.log_result("answer_submission", False,
                    f"Duplicate answer handling failed with status {duplicate_response.status_code}")
                
        except Exception as e:
            self.log_result("answer_submission", False, f"Answer submission error: {e}")
            self.log_result("streak_tracking", False, f"Streak tracking error: {e}")
    
    def test_user_stats(self):
        """Test /api/user/stats endpoint"""
        try:
            headers = {"Authorization": f"Bearer {self.session_token}"}
            
            response = requests.get(f"{BACKEND_URL}/user/stats", headers=headers, timeout=10)
            
            if response.status_code == 200:
                stats = response.json()
                required_fields = ["total_played", "correct_answers", "current_streak", "best_streak"]
                
                if all(field in stats for field in required_fields):
                    # Verify stats are numbers
                    if all(isinstance(stats[field], int) for field in required_fields):
                        self.log_result("user_stats", True,
                            "User stats endpoint works correctly",
                            {"stats": stats})
                    else:
                        self.log_result("user_stats", False,
                            "User stats contain non-integer values",
                            {"stats": stats})
                else:
                    missing_fields = [f for f in required_fields if f not in stats]
                    self.log_result("user_stats", False,
                        f"User stats missing required fields: {missing_fields}",
                        {"stats": stats})
            else:
                self.log_result("user_stats", False,
                    f"User stats failed with status {response.status_code}",
                    {"response": response.text})
                
        except Exception as e:
            self.log_result("user_stats", False, f"User stats error: {e}")
    
    def test_unauthorized_access(self):
        """Test that protected endpoints properly reject unauthorized requests"""
        endpoints_to_test = [
            "/playables/feed",
            "/user/stats"
        ]
        
        for endpoint in endpoints_to_test:
            try:
                response = requests.get(f"{BACKEND_URL}{endpoint}", timeout=10)
                if response.status_code == 401:
                    print(f"✅ {endpoint} correctly rejects unauthorized access")
                else:
                    print(f"❌ {endpoint} should return 401 for unauthorized access, got {response.status_code}")
            except Exception as e:
                print(f"❌ Error testing unauthorized access to {endpoint}: {e}")
    
    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Backend API Tests")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 60)
        
        # Step 1: Create test user and session
        if not self.create_test_user_and_session():
            print("❌ Failed to create test user. Cannot proceed with tests.")
            return False
        
        print("\n📋 Running API Tests...")
        
        # Step 2: Test authentication endpoints
        self.test_auth_session_endpoint()
        self.test_auth_me_endpoint()
        self.test_auth_logout_endpoint()
        
        # Step 3: Test playables and user endpoints
        self.test_playables_feed()
        self.test_answer_submission_and_streak_tracking()
        self.test_user_stats()
        
        # Step 4: Test unauthorized access
        print("\n🔒 Testing Unauthorized Access...")
        self.test_unauthorized_access()
        
        # Step 5: Print summary
        self.print_test_summary()
        
        return True
    
    def print_test_summary(self):
        """Print test results summary"""
        print("\n" + "=" * 60)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results.values() if result["status"] == "pass")
        failed_tests = sum(1 for result in self.test_results.values() if result["status"] == "fail")
        
        for test_name, result in self.test_results.items():
            status_icon = "✅" if result["status"] == "pass" else "❌" if result["status"] == "fail" else "⏳"
            print(f"{status_icon} {test_name.replace('_', ' ').title()}: {result['status'].upper()}")
            
            # Show latest detail
            if result["details"]:
                latest_detail = result["details"][-1]
                print(f"   └─ {latest_detail['message']}")
        
        print(f"\n📈 Results: {passed_tests}/{total_tests} tests passed")
        
        if failed_tests > 0:
            print(f"\n❌ {failed_tests} tests failed. Check details above.")
            return False
        else:
            print("\n🎉 All tests passed!")
            return True

def main():
    """Main function to run backend tests"""
    tester = BackendTester()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()