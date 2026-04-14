import os
from datetime import datetime, timezone
from typing import Any, Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING


MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB_NAME = os.getenv("MONGODB_DB_NAME", "smartpass")

client: Optional[AsyncIOMotorClient] = None
database: Optional[AsyncIOMotorDatabase] = None


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
	await db.passes.create_index([("email", ASCENDING), ("reservation_id", ASCENDING)])
	await db.passes.create_index([("access_start", ASCENDING), ("access_end", ASCENDING)])
	await db.passes.create_index([("status", ASCENDING), ("user_type", ASCENDING)])

	await db.access_logs.create_index([("timestamp", DESCENDING)])
	await db.access_logs.create_index([("pass_id", ASCENDING), ("timestamp", DESCENDING)])


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


async def get_pass_by_id(pass_id: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one({"id": pass_id})
	return _normalize(doc)


async def get_pass_by_portal_token(portal_token: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one({"portal_token": portal_token})
	return _normalize(doc)


async def get_guest_pass_by_reservation(email: str, reservation_id: str) -> Optional[dict[str, Any]]:
	db = get_database()
	doc = await db.passes.find_one(
		{
			"user_type": "guest",
			"email": email.lower(),
			"reservation_id": reservation_id,
			"status": {"$in": ["active", "expired"]},
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
