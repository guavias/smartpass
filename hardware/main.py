import RPi.GPIO as GPIO

import time

import re

from pymongo import MongoClient

from datetime import datetime, timezone

RELAY_PIN = 17

UNLOCK_DURATION = 3

MONGO_URL = "connection string"

DB_NAME = "smartpass"

COLLECTION_NAME = "passes"

# Connect to MongoDB

print("Connecting to database...")

client = MongoClient(MONGO_URL)

db = client[DB_NAME]

collection = db[COLLECTION_NAME]

print("Database connected!")

GPIO.setmode(GPIO.BCM)

GPIO.setup(RELAY_PIN, GPIO.OUT, initial=GPIO.LOW)

import base64
import json

def extract_token(raw_code):
    try:
        padding = '=' * (-len(raw_code) % 4)
        raw_code += padding

        decoded_bytes = base64.urlsafe_b64decode(raw_code)
        decoded_str = decoded_bytes.decode('utf-8')

        data = json.loads(decoded_str)

        return data.get("p")
    except Exception as e:
        print(f"Decode error: {e}")
        return None

def is_valid_pass(token):

    try:

        now = datetime.now(timezone.utc)

        result = collection.find_one({

            "id": token,

            "status": "active",

            "access_end": {"$gt": now}

        })

        return result is not None

    except Exception as e:

        print(f"Database error: {e}")

        return False

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

        if not code:

            continue

        if not any(c.isalnum() for c in code):

            continue
        token = extract_token(code)

        print(f"Scanned: {token}")

        if is_valid_pass(token):

            print("Access granted")

            unlock()

        else:

            print("Access denied")

            deny()

except KeyboardInterrupt:

    print("Shutting down...")

finally:

    GPIO.cleanup()

    client.close()