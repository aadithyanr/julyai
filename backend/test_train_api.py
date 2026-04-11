import requests

# 1x28x28 = 784
dummy_input = [[0.0] * 784 for _ in range(8)]
target_batch = [0, 1, 0, 1, 0, 1, 0, 1]

url = "http://localhost:8020/deploy/api/5debad60-beac-4fc3-9005-df28c5392fe2/train"

headers = {
    "Content-Type": "application/json",
    "X-API-Key": "jly_vV6AqxFKWF_QKm8xF4s3tcRDdjasYLrE4kZItVHyfgE",
}

print("Testing train API...")
resp = requests.post(url, json={"input": dummy_input, "target": target_batch}, headers=headers)
print("Status:", resp.status_code)
print("Response:", resp.json())
