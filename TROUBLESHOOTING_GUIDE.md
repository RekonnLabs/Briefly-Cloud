# 🔧 Briefly Cloud - Troubleshooting Guide

## 🚨 Common Issues & Solutions

### 1. **Backend Error: ModuleNotFoundError: No module named 'server'**

**❌ Problem:**
Your `server/main.py` is importing like this:
```python
from server.vector_store import get_vector_store_stats
```
But since you're already inside the `/server` folder, this fails — Python is looking for a folder called `server` inside itself.

**✅ Fix:**
Update all `server.` import paths in `server/main.py` and other server modules.

**Change from:**
```python
from server.vector_store import get_vector_store_stats
from server.vector_store import ChromaVectorStore
from server.vector_store import build_vector_index, get_vector_store_stats
from server.vector_store import get_relevant_context
```

**To:**
```python
from vector_store import get_vector_store_stats
from vector_store import ChromaVectorStore
from vector_store import build_vector_index, get_vector_store_stats
from vector_store import get_relevant_context
```

### 2. **Frontend Error: npm ERR! Missing script: "dev"**

**❌ Problem:**
Your `package.json` is missing a "dev" script. This is why `npm run dev` fails.

**✅ Fix:**
The root `package.json` has been updated with proper scripts:

```json
{
  "scripts": {
    "dev": "concurrently \"cd client && npm run dev\" \"cd server && python main.py\"",
    "build": "cd client && npm run build",
    "preview": "cd client && npm run preview",
    "install-all": "npm install && cd client && npm install && cd ../server && pip install -r requirements.txt"
  }
}
```

## 🛠️ Additional Improvements & Suggestions

### 3. **Environment Configuration**

**Create proper environment files:**

1. **Server Environment** (`server/.env`):
```env
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Vector Store
CHROMA_PERSIST_DIRECTORY=./chroma_db
CHROMA_COLLECTION_NAME=briefly_cloud

# Server Configuration
HOST=0.0.0.0
PORT=8000
DEBUG=True

# CORS
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

2. **Client Environment** (`client/.env`):
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_APP_NAME=Briefly Cloud
```

### 4. **Dependency Management**

**Install missing dependencies:**

```bash
# Root dependencies
npm install concurrently --save-dev

# Client dependencies (if missing)
cd client
npm install @vitejs/plugin-react vite --save-dev

# Server dependencies (if missing)
cd ../server
pip install fastapi uvicorn python-multipart python-dotenv
```

### 5. **Development Workflow Improvements**

**A. Better Error Handling in Python:**
```python
# Add to server/main.py
import logging
import sys
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Add error handling for imports
try:
    from vector_store import get_vector_store_stats
    logger.info("Successfully imported vector_store modules")
except ImportError as e:
    logger.error(f"Failed to import vector_store: {e}")
    sys.exit(1)
```

**B. CORS Configuration:**
```python
# Add to server/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 6. **Project Structure Validation**

**Ensure your project has this structure:**
```
Briefly_Cloud/
├── package.json                 # Root package.json with dev script
├── client/
│   ├── package.json            # Client package.json with Vite
│   ├── src/
│   ├── index.html
│   └── vite.config.js
├── server/
│   ├── main.py                 # Fixed imports (no 'server.' prefix)
│   ├── requirements.txt
│   ├── .env                    # Your API keys
│   └── vector_store.py
└── start-briefly-cloud-dev-fixed.bat  # Improved batch script
```

### 7. **Testing the Setup**

**Step-by-step testing:**

1. **Test Python imports:**
```bash
cd server
python -c "from vector_store import get_vector_store_stats; print('✓ Imports working')"
```

2. **Test server startup:**
```bash
cd server
python main.py
# Should start without import errors
```

3. **Test client startup:**
```bash
cd client
npm run dev
# Should start Vite dev server
```

4. **Test full development setup:**
```bash
# From root directory
npm run dev
# Should start both client and server
```

### 8. **Performance Optimizations**

**A. Add development vs production configs:**
```python
# server/config.py
import os
from pathlib import Path

class Config:
    DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
    HOST = os.getenv('HOST', '127.0.0.1')
    PORT = int(os.getenv('PORT', 8000))
    
    # Vector store settings
    CHROMA_PERSIST_DIRECTORY = os.getenv('CHROMA_PERSIST_DIRECTORY', './chroma_db')
    CHROMA_COLLECTION_NAME = os.getenv('CHROMA_COLLECTION_NAME', 'briefly_cloud')
    
    # API Keys
    OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
    ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY')
```

**B. Add hot reload for Python:**
```bash
# Install uvicorn with reload
pip install uvicorn[standard]

# Update server startup
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 9. **Docker Support (Optional)**

**Create `docker-compose.yml` for easier development:**
```yaml
version: '3.8'
services:
  client:
    build: ./client
    ports:
      - "5173:5173"
    volumes:
      - ./client:/app
      - /app/node_modules
    
  server:
    build: ./server
    ports:
      - "8000:8000"
    volumes:
      - ./server:/app
    environment:
      - DEBUG=True
    depends_on:
      - client
```

### 10. **VS Code Configuration**

**Create `.vscode/launch.json` for debugging:**
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Python: FastAPI",
            "type": "python",
            "request": "launch",
            "program": "${workspaceFolder}/server/main.py",
            "console": "integratedTerminal",
            "cwd": "${workspaceFolder}/server"
        }
    ]
}
```

## 🎯 Quick Start Checklist

- [ ] ✅ Fixed server imports (removed `server.` prefix)
- [ ] ✅ Added dev script to package.json
- [ ] ✅ Installed concurrently dependency
- [ ] ✅ Created .env files with API keys
- [ ] ✅ Verified project structure
- [ ] ✅ Tested individual components
- [ ] ✅ Tested full development setup
- [ ] ✅ Added error handling and logging
- [ ] ✅ Configured CORS for client-server communication

## 🚀 Ready to Go!

Your Briefly Cloud project should now start successfully with:
```bash
npm run dev
```

Or use the improved batch script:
```bash
start-briefly-cloud-dev-fixed.bat
```

## 📞 Need More Help?

If you encounter additional issues:

1. Check the console logs for specific error messages
2. Verify all dependencies are installed
3. Ensure API keys are properly configured
4. Test each component individually
5. Check network connectivity and port availability

Happy coding! 🎉

