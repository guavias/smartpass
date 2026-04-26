import RPi.GPIO as GPIO
import time
import re
import base64
import json
import uuid
from datetime import datetime, timezone

from pymongo import MongoClient

RELAY_PIN = 17
UNLOCK_DURATION = 3

MONGO_URL = "connection string"
DB_NAME = "smartpass"

GATE_LOCATION = "crappie_house"
SCANNER_ID = "pi-gate-01"

print("Connecting to database...")
client = MongoClient(MONGO_URL)
db = client[DB_NAME]
passes = db["passes"]
access_logs = db["access_logs"]
print("Database connected!")

GPIO.setmode(GPIO.BCM)
GPIO.setup(RELAY_PIN, GPIO.OUT, initial=GPIO.LOW)


def extract_pass_id(raw_code):
    """Decode base64url QR payload and extract pass ID ('p' field)."""
    try:
        padding = '=' * (-len(raw_code) % 4)
        decoded = base64.urlsafe_b64decode(raw_code + padding)
        data = json.loads(decoded.decode('utf-8'))
        return data.get("p")
    except Exception as e:
        print(f"Decode error: {e}")
        return None


def validate_pass(pass_id):
    """
    Look up the pass and determine access result.
    Returns (granted: bool, pass_doc: dict | None, reason: str)
    """
    if not pass_id:
        return False, None, "invalid_qr"

    try:
        doc = passes.find_one({"id": pass_id})
    except Exception as e:
        print(f"Database error: {e}")
        return False, None, "db_error"

    if not doc:
        return False, None, "not_found"

    now = datetime.now(timezone.utc)

    access_start = doc.get("access_start")
    if access_start and access_start.tzinfo is None:
        access_start = access_start.replace(tzinfo=timezone.utc)

    access_end = doc.get("access_end")
    if access_end and access_end.tzinfo is None:
        access_end = access_end.replace(tzinfo=timezone.utc)

    if access_start and now < access_start:
        return False, doc, "inactive"

    if access_end and now > access_end:
        return False, doc, "expired"

    # Within the active window: check for revocation
    status = str(doc.get("status", "")).lower()
    status_override = str(doc.get("status_override", "")).lower()
    if status == "revoked" or status_override == "revoked":
        return False, doc, "revoked"

    return True, doc, "valid"


def log_event(granted, doc, reason):
    """Write an access attempt to the access_logs collection."""
    try:
        entry = {
            "event_id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc),
            "gate_location": GATE_LOCATION,
            "scanner_id": SCANNER_ID,
            "validation_result": "granted" if granted else "denied",
            "reason": reason,
            "pass_id": doc.get("id") if doc else None,
            "reservation_id": doc.get("reservation_id") if doc else None,
            "guest_name": doc.get("name") if doc else None,
            "holder_name": doc.get("name") if doc else None,
        }
        access_logs.insert_one(entry)
    except Exception as e:
        print(f"Failed to write access log: {e}")


def unlock():
    GPIO.output(RELAY_PIN, GPIO.HIGH)
    time.sleep(UNLOCK_DURATION)
    GPIO.output(RELAY_PIN, GPIO.LOW)


def deny():
    time.sleep(1.5)


print("Smart Pass ready. Scan a QR code...")

try:
    while True:
        code = input().strip()
        code = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', code)

        if not code or not any(c.isalnum() for c in code):
            continue

        pass_id = extract_pass_id(code)
        print(f"Scanned pass ID: {pass_id}")

        granted, doc, reason = validate_pass(pass_id)
        log_event(granted, doc, reason)

        if granted:
            print(f"Access GRANTED — {doc.get('name', 'Unknown')} ({reason})")
            unlock()
        else:
            print(f"Access DENIED — reason: {reason}")
            deny()

except KeyboardInterrupt:
    print("Shutting down...")
finally:
    GPIO.cleanup()
    client.close()
