#!/usr/bin/env python3
"""
Test script to verify timezone handling in API responses.
Run this after starting the backend server.
"""
import asyncio
import json
from datetime import datetime, timezone, timedelta
import httpx

BASE_URL = "http://localhost:8000"

async def test_timezone_handling():
    """Test that API responses include proper timezone info"""
    
    async with httpx.AsyncClient() as client:
        # Create a visitor pass
        visitor_data = {
            "name": "Test User",
            "email": "test@example.com",
            "phone": "555-1234",
            "vehicle_info": "2020 Honda Civic",
            "payment_amount": 50.00,
            "payment_method": "cash",
            "num_days": 1,
            "num_adults": 1,
            "num_children": 0,
        }
        
        print("Creating visitor pass...")
        response = await client.post(
            f"{BASE_URL}/api/v1/visitors",
            json=visitor_data
        )
        
        if response.status_code != 200:
            print(f"Error creating pass: {response.status_code}")
            print(response.text)
            return
        
        pass_data = response.json()
        pass_id = pass_data.get("id")
        portal_token = pass_data.get("portal_token")
        
        print(f"\nPass created successfully:")
        print(f"  Pass ID: {pass_id}")
        print(f"  Portal Token: {portal_token}")
        
        # Get portal access info
        print(f"\nFetching portal access info...")
        response = await client.get(
            f"{BASE_URL}/api/v1/access/portal/{portal_token}"
        )
        
        if response.status_code != 200:
            print(f"Error getting portal: {response.status_code}")
            print(response.text)
            return
        
        portal_data = response.json()
        access_start = portal_data.get("access_start")
        access_end = portal_data.get("access_end")
        
        print(f"\nPortal Access Response:")
        print(json.dumps(portal_data, indent=2))
        
        # Check timezone info
        print(f"\n=== TIMEZONE VERIFICATION ===")
        print(f"access_start: {access_start}")
        print(f"Has 'Z' suffix: {'Z' in access_start if access_start else 'N/A'}")
        print(f"Has timezone offset: {'+' in access_start or access_start.count('-') > 2 if access_start else 'N/A'}")
        
        print(f"\naccess_end: {access_end}")
        print(f"Has 'Z' suffix: {'Z' in access_end if access_end else 'N/A'}")
        print(f"Has timezone offset: {'+' in access_end or access_end.count('-') > 2 if access_end else 'N/A'}")
        
        # Verify the times can be parsed correctly
        if access_start:
            try:
                # Python's datetime parser should handle ISO format with Z
                parsed_start = datetime.fromisoformat(access_start.replace('Z', '+00:00'))
                print(f"\n✓ access_start parses correctly as UTC: {parsed_start}")
            except Exception as e:
                print(f"\n✗ Failed to parse access_start: {e}")
        
        if access_end:
            try:
                parsed_end = datetime.fromisoformat(access_end.replace('Z', '+00:00'))
                print(f"✓ access_end parses correctly as UTC: {parsed_end}")
            except Exception as e:
                print(f"✗ Failed to parse access_end: {e}")

if __name__ == "__main__":
    print("SmartPass Timezone Handling Test")
    print("=" * 50)
    
    try:
        asyncio.run(test_timezone_handling())
        print("\n" + "=" * 50)
        print("Test completed!")
    except Exception as e:
        print(f"Test failed with error: {e}")
        import traceback
        traceback.print_exc()
