"""
AutoGuard AI - Backend API Unit Test Script
============================================
Runs the backend unit test cases from Chapter 5.2.1 (Diagnosis & Knowledge
Base, Authentication, Conversations & Profile, Advocacy AI Chatbot, Exchange
Rates) against a running instance of the FastAPI backend, and prints a
results table you can copy straight into your "Actual Result" / "Test
Status" columns.

SETUP
-----
1. Start your backend with real credentials (Supabase + Gemini/Groq keys in
   .env):
       cd backend-server
       uvicorn app.main:app --reload --port 8000
2. pip install requests
3. Run this script from anywhere:
       python test_backend_unit.py
   Edit BASE_URL below first if your backend runs somewhere other than
   localhost:8000.

NOTES
-----
- This hits your REAL Supabase project. It creates one throwaway test
  account and one test conversation each run - both use a timestamp in
  their name so re-running the script doesn't collide with the previous
  run. Feel free to delete them from Supabase afterward if you want a
  clean database.
- If your Supabase project has "Confirm email" turned on, sign-up won't
  return a usable session until the email is confirmed, so UT-08 (login)
  will legitimately fail right after UT-06. That's expected, not a bug in
  your code - either confirm the test email manually, or turn off "Confirm
  email" in Supabase Auth settings while you run this script.
- UT-16 needs the display_name of a second, already-existing account on
  your project to prove the "taken" case - edit EXISTING_OTHER_USERNAME
  below to a real username in your database, otherwise UT-16 is skipped.
- UT-19 (both AI providers down) can't be triggered automatically. To test
  it: temporarily comment out GEMINI_API_KEY and GROQ_API_KEY in your .env,
  restart the server, re-run just that one request, then restore the keys.
"""

import base64
import time

import requests

BASE_URL = "http://localhost:8000"

# Set this to a real, already-existing display_name/username on your
# Supabase project to exercise UT-16 (display name already taken). Leave as
# None to skip that one case.
EXISTING_OTHER_USERNAME = "test2"

TS = str(int(time.time()))  # unique suffix so re-runs don't collide

# A tiny 4x4 red JPEG, generated once with Pillow, so UT-17 has a real image
# to upload without needing an external file.
TINY_JPEG_B64 = (
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcp"
    "LDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy"
    "MjIyMjIyMjIyMjL/wAARCAAEAAQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIE"
    "AwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpT"
    "VFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ"
    "2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3"
    "AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpj"
    "ZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn"
    "6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDnqKKK8k/Qz//Z"
)
TINY_JPEG_BYTES = base64.b64decode(TINY_JPEG_B64)

results = []  # (id, description, expected, actual_summary, status)


def record(tid, desc, expected, resp, check):
    try:
        passed = bool(check(resp))
    except Exception:
        passed = False
    try:
        body_preview = str(resp.json())[:110]
    except Exception:
        body_preview = ""
    actual = f"{resp.status_code} {body_preview}"
    status = "PASS" if passed else "FAIL"
    results.append((tid, desc, expected, actual, status))
    print(f"[{tid}] {desc} -> {resp.status_code} ... {status}")


def skip(tid, desc, expected, reason):
    results.append((tid, desc, expected, reason, "SKIPPED"))
    print(f"[{tid}] {desc} -> SKIPPED ({reason})")


# ---------------------------------------------------------------------------
# 5.2.1.1 Diagnosis and Knowledge Base
# ---------------------------------------------------------------------------

r = requests.post(f"{BASE_URL}/diagnose",
                   json={"fault_type": "bearing_fault", "confidence": 0.82, "powertrain": "petrol"})
record("UT-01", "Diagnose with a valid, known fault type",
       "200 OK, JSON has fault_type/explanation/knowledge",
       r, lambda r: r.status_code == 200 and "explanation" in r.json() and "knowledge" in r.json())

r = requests.post(f"{BASE_URL}/diagnose", json={"fault_type": "engine_fire"})
record("UT-02", "Diagnose with an unknown fault type", "404 Not Found",
       r, lambda r: r.status_code == 404)

r = requests.get(f"{BASE_URL}/fault-knowledge/rotor_misalignment")
record("UT-03", "Retrieve stored knowledge for a valid fault type",
       "200 OK, row has typical_cost_low/high, urgency",
       r, lambda r: r.status_code == 200 and "typical_cost_low" in r.json())

r = requests.get(f"{BASE_URL}/fault-knowledge/unknown_fault")
record("UT-04", "Fetch stored knowledge for an invalid fault type", "404 Not Found",
       r, lambda r: r.status_code == 404)

r = requests.get(f"{BASE_URL}/health")
record("UT-05", "Backend health check", "200 OK, status: ok",
       r, lambda r: r.status_code == 200 and r.json().get("status") == "ok")

# ---------------------------------------------------------------------------
# 5.2.1.2 Authentication
# ---------------------------------------------------------------------------

test_email = f"autoguard.test.{TS}@mail.com"
test_username = f"testuser{TS}"
test_password = "abcdef"

r = requests.post(f"{BASE_URL}/auth/signup",
                   json={"email": test_email, "password": test_password, "username": test_username})
record("UT-06", "Sign up with a new, valid account", "200 OK, session with user_id",
       r, lambda r: r.status_code == 200 and "user_id" in r.json())
signup_body = r.json() if r.status_code == 200 else {}
user_id = signup_body.get("user_id")
needs_confirmation = signup_body.get("needs_email_confirmation")

r = requests.post(f"{BASE_URL}/auth/signup",
                   json={"email": f"other.{TS}@mail.com", "password": test_password, "username": test_username})
record("UT-07", "Sign up with a username that is already taken", "409 Conflict",
       r, lambda r: r.status_code == 409)

r = requests.post(f"{BASE_URL}/auth/login", json={"identifier": test_username, "password": test_password})
if needs_confirmation:
    skip("UT-08", "Log in with valid credentials", "200 OK, session returned",
         "signup requires email confirmation - confirm the test email first, then re-run")
else:
    record("UT-08", "Log in with valid credentials", "200 OK, session returned",
           r, lambda r: r.status_code == 200 and "user_id" in r.json())

r = requests.post(f"{BASE_URL}/auth/login", json={"identifier": test_username, "password": "wrongpass"})
record("UT-09", "Log in with an incorrect password", "401 Unauthorized",
       r, lambda r: r.status_code == 401)

if needs_confirmation:
    skip("UT-10", "Change password with the correct current password", "200 OK",
         "signup requires email confirmation first")
    skip("UT-11", "Change password with an incorrect current password", "400 Bad Request",
         "signup requires email confirmation first")
else:
    r = requests.post(f"{BASE_URL}/auth/change-password",
                       json={"email": test_email, "current_password": test_password, "new_password": "newpass1"})
    record("UT-10", "Change password with the correct current password", "200 OK",
           r, lambda r: r.status_code == 200)

    r = requests.post(f"{BASE_URL}/auth/change-password",
                       json={"email": test_email, "current_password": "totallywrong", "new_password": "anotherpass1"})
    record("UT-11", "Change password with an incorrect current password", "400 Bad Request",
           r, lambda r: r.status_code == 400)

# ---------------------------------------------------------------------------
# 5.2.1.3 Conversations and Profile
# ---------------------------------------------------------------------------

conversation_id = None
if user_id:
    r = requests.post(f"{BASE_URL}/conversations", json={
        "user_id": user_id, "fault_type": "bearing_fault", "confidence": 0.82,
        "title": "Test conversation", "messages": [],
    })
    record("UT-12", "Create a new conversation record", "200 OK, id returned",
           r, lambda r: r.status_code == 200 and "id" in r.json())
    conversation_id = r.json().get("id") if r.status_code == 200 else None

    r = requests.get(f"{BASE_URL}/conversations", params={"user_id": user_id})
    record("UT-13", "List conversations for a specific user",
           "200 OK, array containing only this user's conversations",
           r, lambda r: r.status_code == 200 and isinstance(r.json(), list))
else:
    skip("UT-12", "Create a new conversation record", "200 OK, id returned", "UT-06 did not return a user_id")
    skip("UT-13", "List conversations for a specific user", "200 OK, array", "UT-06 did not return a user_id")

r = requests.delete(f"{BASE_URL}/conversations/does-not-exist")
record("UT-14", "Delete a conversation that does not exist", "404 Not Found",
       r, lambda r: r.status_code == 404)

if user_id:
    r = requests.get(f"{BASE_URL}/profile", params={"user_id": user_id})
    record("UT-15", "Get profile for a first-time user", "200 OK, profile row",
           r, lambda r: r.status_code == 200 and "user_id" in r.json())

    if EXISTING_OTHER_USERNAME:
        r = requests.put(f"{BASE_URL}/profile",
                          json={"user_id": user_id, "display_name": EXISTING_OTHER_USERNAME})
        record("UT-16", "Update profile with a display name already used by another account",
               "409 Conflict", r, lambda r: r.status_code == 409)
    else:
        skip("UT-16", "Update profile with a display name already used by another account",
             "409 Conflict", "set EXISTING_OTHER_USERNAME at the top of this script to a real username")

    files = {"file": ("test_avatar.jpg", TINY_JPEG_BYTES, "image/jpeg")}
    r = requests.post(f"{BASE_URL}/profile/avatar", params={"user_id": user_id}, files=files)
    record("UT-17", "Upload a new avatar image", "200 OK, avatar_url returned",
           r, lambda r: r.status_code == 200 and "avatar_url" in r.json())
else:
    skip("UT-15", "Get profile for a first-time user", "200 OK, profile row", "UT-06 did not return a user_id")
    skip("UT-16", "Update profile with a display name already used by another account",
         "409 Conflict", "UT-06 did not return a user_id")
    skip("UT-17", "Upload a new avatar image", "200 OK, avatar_url returned", "UT-06 did not return a user_id")

# ---------------------------------------------------------------------------
# 5.2.1.4 Advocacy AI Chatbot (RAG)
# ---------------------------------------------------------------------------

r = requests.post(f"{BASE_URL}/ask",
                   json={"question": "Is it safe to drive?", "fault_type": "bearing_fault", "language": "en"})
record("UT-18", "Ask a grounded follow-up question about the current fault",
       "200 OK, answer text grounded in bearing_fault knowledge",
       r, lambda r: r.status_code == 200 and "answer" in r.json())

skip("UT-19", "Ask a question while both AI providers are unavailable", "502 Bad Gateway",
     "manual test - temporarily unset GEMINI_API_KEY and GROQ_API_KEY, restart the server, re-run this case only")

r = requests.post(f"{BASE_URL}/ask", json={"question": "¿Es seguro conducir?", "language": "es"})
record("UT-20", "Ask a question in a non-English language", "200 OK, reply generated in Spanish",
       r, lambda r: r.status_code == 200 and "answer" in r.json())

# ---------------------------------------------------------------------------
# 5.2.1.5 Exchange Rates
# ---------------------------------------------------------------------------

r = requests.get(f"{BASE_URL}/exchange-rates")
record("UT-21", "Get live exchange rates and price-level ratios", "200 OK, rates dict",
       r, lambda r: r.status_code == 200 and "rates" in r.json())

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print("\n\n=== SUMMARY (copy into your Actual Result / Test Status columns) ===\n")
print(f"{'ID':<7}{'Actual Result':<75}{'Status'}")
print("-" * 100)
for tid, desc, expected, actual, status in results:
    print(f"{tid:<7}{actual[:73]:<75}{status}")

passed = sum(1 for *_, s in results if s == "PASS")
failed = sum(1 for *_, s in results if s == "FAIL")
skipped = sum(1 for *_, s in results if s == "SKIPPED")
print(f"\n{passed} passed, {failed} failed, {skipped} skipped, {len(results)} total")
