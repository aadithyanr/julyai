import os
import sys
import base64
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

if not url or not key:
    print("❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env")
    exit(1)

supabase = create_client(url, key)

model_id = "288702e0-8efc-4af1-8688-c5e92f60522e"
if len(sys.argv) > 1:
    model_id = sys.argv[1]

print(f"--- Checking Model ID: {model_id} ---")

try:
    # 1. Check Database
    res = supabase.table("trained_models").select("*").eq("id", model_id).execute()
    if not res.data:
        print(f"❌ Model {model_id} NOT found in database.")
    else:
        model_data = res.data[0]
        print(f"✅ Model found: {model_data.get('name')}")
        path = model_data.get("model_storage_path")
        print(f"   Storage path: {path}")

        # 2. Check Storage
        if path:
            try:
                print(f"--- Attempting download from bucket 'ai-models' at path: {path} ---")
                content = supabase.storage.from_("ai-models").download(path)
                if content:
                    print(f"✅ Success! Content size: {len(content)} bytes")
                    # Try to decode just to check
                    try:
                        text = content.decode("utf-8")
                        print(f"   Content is base64 string (starts with: {text[:20]}...)")
                        print(f"   Decoded bytes size: {len(base64.b64decode(text))} bytes")
                    except:
                        print("   Content is raw bytes (not a base64 string).")
                else:
                    print(f"❌ Storage returned EMPTY content for path: {path}")
            except Exception as e:
                print(f"❌ Storage download FAILED. Error: {e}")
        else:
            print("❌ Model metadata is missing 'model_storage_path'.")

except Exception as e:
    print(f"❌ Database error: {e}")
