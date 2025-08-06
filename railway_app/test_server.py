#!/usr/bin/env python3
"""
Ultra-minimal test server for Railway
"""
from fastapi import FastAPI
import os
import uvicorn

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello Railway!", "port": os.getenv("PORT", "8000")}

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"Starting test server on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)