import requests
import uuid
import json

BASE_URL = "http://localhost:8000/api"
STUDY_SLUG = "example-study"

def test_submission(data, expected_status, description):
    print(f"\nTesting: {description}")
    response = requests.post(f"{BASE_URL}/submit", json=data)
    if response.status_code == expected_status:
        print(f"✅ Success: Got expected status {expected_status}")
    else:
        print(f"❌ Failed: Expected {expected_status}, got {response.status_code}")
        print(f"Response: {response.text}")

def run_tests():
    # 1. Get Study Info to know statements and grid_config
    resp = requests.get(f"{BASE_URL}/study/{STUDY_SLUG}")
    if resp.status_code != 200:
        print(f"Failed to get study info: {resp.text}")
        return
    study = resp.json()
    statements = study['statements']
    grid_config = study['grid_config'] # List[dict(score, capacity)]
    
    token = str(uuid.uuid4())
    
    # helper to build valid qsort
    def build_qsort(dist):
        qsort = []
        stmt_idx = 0
        for score, count in dist.items():
            for _ in range(count):
                if stmt_idx < len(statements):
                    qsort.append({
                        "statement_id": statements[stmt_idx]['id'],
                        "grid_score": score,
                        "card_comment": ""
                    })
                    stmt_idx += 1
        return qsort

    # Ideal distribution from config
    ideal_dist = {col['score']: col['capacity'] for col in grid_config}
    
    # Test GET validation
    print("\nTesting GET /study validation")
    resp = requests.get(f"{BASE_URL}/study/INVALID_SLUG_@!")
    if resp.status_code == 422:
        print("✅ Success: Malformed slug in GET rejected with 422")
    else:
        print(f"❌ Failed: Malformed slug in GET expected 422, got {resp.status_code}")

    resp = requests.get(f"{BASE_URL}/study/example-study?lang=eng-US-123")
    if resp.status_code == 422:
        print("✅ Success: Malformed lang in GET rejected with 422")
    else:
        print(f"❌ Failed: Malformed lang in GET expected 422, got {resp.status_code}")

    # Proceed with submission tests
    
    # Test Case 1: Valid Submission
    valid_data = {
        "session_token": token,
        "study_slug": STUDY_SLUG,
        "language_used": "en",
        "status": "completed",
        "qsort": build_qsort(ideal_dist)
    }
    test_submission(valid_data, 200, "Valid perfect submission")

    # Test Case 2: Overfilled Column
    overfilled_dist = ideal_dist.copy()
    # Move one from score 0 to score 1 (if they exist)
    if 0 in overfilled_dist and 1 in overfilled_dist:
        overfilled_dist[0] -= 1
        overfilled_dist[1] += 1
        
        overfilled_data = valid_data.copy()
        overfilled_data["qsort"] = build_qsort(overfilled_dist)
        test_submission(overfilled_data, 400, "Overfilled column (+1 in score 1)")

    # Test Case 3: Invalid Score (Score 10 not in config)
    invalid_score_data = valid_data.copy()
    if len(invalid_score_data["qsort"]) > 0:
        invalid_score_data["qsort"] = [entry.copy() for entry in invalid_score_data["qsort"]]
        invalid_score_data["qsort"][0]["grid_score"] = 10
        test_submission(invalid_score_data, 400, "Invalid grid score (10)")

    # Test Case 4: Incomplete Submission (missing cards)
    incomplete_data = valid_data.copy()
    if len(incomplete_data["qsort"]) > 1:
        incomplete_data["qsort"] = incomplete_data["qsort"][:-1]
        test_submission(incomplete_data, 400, "Incomplete submission (missing one card)")

    # Test Case 5: Statement Ownership (ID not in study)
    wrong_owner_data = valid_data.copy()
    wrong_owner_data["qsort"] = [entry.copy() for entry in wrong_owner_data["qsort"]]
    # Use an ID that is likely not in this study (e.g., 9999)
    wrong_owner_data["qsort"][0]["statement_id"] = 9999
    test_submission(wrong_owner_data, 400, "Statement Ownership (ID 9999 not in study)")

    # Test Case 6: Malformed Slug
    malformed_slug_data = valid_data.copy()
    malformed_slug_data["study_slug"] = "INVALID_SLUG_@!"
    test_submission(malformed_slug_data, 422, "Malformed study slug (contains uppercase and symbols)")

    # Test Case 7: Malformed Language Code
    malformed_lang_data = valid_data.copy()
    malformed_lang_data["language_used"] = "eng-US-123"
    test_submission(malformed_lang_data, 422, "Malformed language code (too long/invalid format)")

if __name__ == "__main__":
    run_tests()
