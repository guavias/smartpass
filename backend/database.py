import os
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from passlib.context import CryptContext
from pymongo import ASCENDING, DESCENDING


MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "smartpass")

client: Optional[AsyncIOMotorClient] = None
database: Optional[AsyncIOMotorDatabase] = None
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _normalize(doc: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
	if not doc:
		return None
	data = dict(doc)
	if "_id" in data:
		data["_id"] = str(data["_id"])
	
	# Ensure all datetime fields have UTC timezone info
	for key, value in data.items():
		if isinstance(value, datetime):
			if value.tzinfo is None:
				data[key] = value.replace(tzinfo=timezone.utc)
			else:
				# Convert to UTC if it's not already
				data[key] = value.astimezone(timezone.utc)
	
	return data


async def connect_to_mongo() -> None:
	global client, database
	if database is not None:
		return

	client = AsyncIOMotorClient(MONGODB_URL)
	database = client[MONGODB_DB_NAME]

	await _ensure_indexes()
	await _ensure_seed_admin_user()


async def close_mongo_connection() -> None:
	global client, database
	if client is not None:
		client.close()
	client = None
	database = None


def get_database() -> AsyncIOMotorDatabase:
	if database is None:
		raise RuntimeError("MongoDB is not connected")
	return database


async def _ensure_indexes() -> None:
	db = get_database()

	await db.passes.create_index([("id", ASCENDING)], unique=True)
	await db.passes.create_index([("portal_token", ASCENDING)], unique=True)
	await db.passes.create_index([("qr_static_payload", ASCENDING)])
	await db.passes.create_index([("email", ASCENDING), ("reservation_id", ASCENDING)])
	await db.passes.create_index([("access_start", ASCENDING), ("access_end", ASCENDING)])
	await db.passes.create_index([("status", ASCENDING), ("user_type", ASCENDING)])

	await db.access_logs.create_index([("timestamp", DESCENDING)])
	await db.access_logs.create_index([("pass_id", ASCENDING), ("timestamp", DESCENDING)])

	await db.admin_users.create_index([("email", ASCENDING)], unique=True)
	await db.admin_users.create_index([("id", ASCENDING)], unique=True)


def hash_password(password: str) -> str:
	return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
	if not password_hash:
		return False
	try:
		return pwd_context.verify(password, password_hash)
	except Exception:
		return False


async def upsert_admin_user(
	email: str,
	password: str,
	name: str,
	role: str = "admin",
	admin_id: Optional[str] = None,
) -> dict[str, Any]:
	db = get_database()
	normalized_email = email.strip().lower()
	normalized_role = role.strip().lower() if role else "admin"
	resolved_admin_id = admin_id.strip() if admin_id else f"admin-{normalized_email}"
	now = utcnow()

	update_doc = {
		"email": normalized_email,
		"name": name.strip() if name else "SmartPass Admin",
		"role": normalized_role,
		"password_hash": hash_password(password),
		"id": resolved_admin_id,
		"updated_at": now,
		"is_active": True,
	}

	await db.admin_users.update_one(
		{"email": normalized_email},
		{
			"$set": update_doc,
			"$setOnInsert": {"created_at": now},
		},
		upsert=True,
	)

	admin_doc = await db.admin_users.find_one({"email": normalized_email})
	if not admin_doc:
		raise RuntimeError("Failed to upsert admin user")
	return _normalize(admin_doc) or {}


async def get_admin_by_email(email: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.admin_users.find_one({"email": email.strip().lower()})
	return _normalize(doc)


async def verify_admin_credentials(email: str, password: str) -> Optional[dict[str, Any]]:
	admin_doc = await get_admin_by_email(email)
	if not admin_doc:
		return None

	if not admin_doc.get("is_active", True):
		return None

	if not verify_password(password, str(admin_doc.get("password_hash", ""))):
		return None

	return admin_doc


async def _ensure_seed_admin_user() -> None:
	seed_on_startup = os.getenv("ADMIN_SEED_ON_STARTUP", "true").strip().lower() == "true"
	if not seed_on_startup:
		return

	admin_email = os.getenv("ADMIN_EMAIL")
	admin_password = os.getenv("ADMIN_PASSWORD")
	if not admin_email or not admin_password:
		return

	admin_name = os.getenv("ADMIN_NAME", "SmartPass Admin")
	admin_role = os.getenv("ADMIN_ROLE", "admin")
	admin_id = os.getenv("ADMIN_ID")

	await upsert_admin_user(
		email=admin_email,
		password=admin_password,
		name=admin_name,
		role=admin_role,
		admin_id=admin_id,
	)


async def create_pass(pass_data: dict[str, Any]) -> dict[str, Any]:
	db = get_database()
	payload = dict(pass_data)
	payload.setdefault("created_at", utcnow())
	await db.passes.insert_one(payload)
	return _normalize(payload)


async def update_pass(pass_id: str, updates: dict[str, Any]) -> Optional[dict[str, Any]]:
	db = get_database()
	update_doc = dict(updates)
	update_doc["updated_at"] = utcnow()
	await db.passes.update_one({"id": pass_id}, {"$set": update_doc})
	return await get_pass_by_id(pass_id)


async def delete_pass(pass_id: str) -> bool:
	db = get_database()
	result = await db.passes.delete_one({"id": pass_id})
	return result.deleted_count > 0


async def get_pass_by_id(pass_id: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one({"id": pass_id})
	return _normalize(doc)


async def get_pass_by_portal_token(portal_token: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one({"portal_token": portal_token})
	return _normalize(doc)


async def get_pass_by_qr_payload(qr_payload: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one({"qr_static_payload": qr_payload})
	return _normalize(doc)


async def get_guest_pass_by_reservation(email: str, reservation_id: str) -> Optional[dict[str, Any]]:
	"""Find overnight guest pass by email + reservation_id (includes inactive future passes)."""
	db = get_database()
	doc = await db.passes.find_one(
		{
			"user_type": "guest",
			"email": email.lower(),
			"reservation_id": reservation_id,
			"status": {"$in": ["active", "inactive", "expired"]},
		},
		sort=[("created_at", DESCENDING)],
	)
	return _normalize(doc)


async def get_day_pass_by_reservation(email: str, reservation_id: str) -> Optional[dict[str, Any]]:
	"""Find companion day pass (visitor type) linked to an overnight reservation."""
	db = get_database()
	doc = await db.passes.find_one(
		{
			"user_type": "visitor",
			"email": email.lower(),
			"reservation_id": reservation_id,
			"status": {"$in": ["active", "inactive", "expired"]},
		},
		sort=[("created_at", DESCENDING)],
	)
	return _normalize(doc)


async def find_passes_by_email(email: str, limit: int = 10) -> list[dict[str, Any]]:
	db = get_database()
	cursor = db.passes.find({"email": email.lower()}).sort("created_at", DESCENDING).limit(limit)
	return [_normalize(doc) for doc in await cursor.to_list(length=limit)]


async def log_access_event(event: dict[str, Any]) -> dict[str, Any]:
	db = get_database()
	payload = dict(event)
	payload.setdefault("timestamp", utcnow())
	await db.access_logs.insert_one(payload)
	return _normalize(payload)


async def get_access_logs(limit: int = 100, offset: int = 0) -> list[dict[str, Any]]:
	db = get_database()
	cursor = db.access_logs.find().sort("timestamp", DESCENDING).skip(offset).limit(limit)
	return [_normalize(doc) for doc in await cursor.to_list(length=limit)]


async def get_access_logs_total() -> int:
	db = get_database()
	return await db.access_logs.count_documents({})


def _date_bounds(start_date: Optional[datetime], end_date: Optional[datetime]) -> dict[str, Any]:
	if start_date is None and end_date is None:
		return {}
	bounds: dict[str, Any] = {}
	if start_date is not None:
		bounds["$gte"] = start_date
	if end_date is not None:
		bounds["$lte"] = end_date
	return bounds


async def query_admin_passes(
	search: Optional[str] = None,
	status: Optional[str] = None,
	pass_type: Optional[str] = None,
	start_date: Optional[datetime] = None,
	end_date: Optional[datetime] = None,
	limit: int = 25,
	offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
	db = get_database()
	query: dict[str, Any] = {}

	if search:
		search_regex = {"$regex": search, "$options": "i"}
		query["$or"] = [
			{"id": search_regex},
			{"reservation_id": search_regex},
			{"name": search_regex},
			{"email": search_regex},
			{"phone": search_regex},
		]

	if status:
		query["status"] = status.lower()

	if pass_type:
		normalized_pass_type = pass_type.lower()
		if normalized_pass_type in {"visitor", "guest"}:
			query["user_type"] = normalized_pass_type

	date_query = _date_bounds(start_date, end_date)
	if date_query:
		query["access_start"] = date_query

	total = await db.passes.count_documents(query)
	cursor = db.passes.find(query).sort("created_at", DESCENDING).skip(offset).limit(limit)
	items = [_normalize(doc) for doc in await cursor.to_list(length=limit)]
	return items, total


async def query_admin_access_logs(
	search: Optional[str] = None,
	result: Optional[str] = None,
	location: Optional[str] = None,
	start_date: Optional[datetime] = None,
	end_date: Optional[datetime] = None,
	limit: int = 25,
	offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
	db = get_database()
	query: dict[str, Any] = {}

	if search:
		search_regex = {"$regex": search, "$options": "i"}
		query["$or"] = [
			{"pass_id": search_regex},
			{"user_id": search_regex},
			{"gate_location": search_regex},
			{"validation_result": search_regex},
		]

	if result:
		query["validation_result"] = result.lower()

	if location:
		query["gate_location"] = location

	time_query = _date_bounds(start_date, end_date)
	if time_query:
		query["timestamp"] = time_query

	total = await db.access_logs.count_documents(query)
	cursor = db.access_logs.find(query).sort("timestamp", DESCENDING).skip(offset).limit(limit)
	items = [_normalize(doc) for doc in await cursor.to_list(length=limit)]
	return items, total
