# Technology Stack

## Architecture
Full-stack application with React frontend and FastAPI backend, designed for desktop deployment with cloud service integrations.

## Frontend Stack
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite 4.4+ with hot reload
- **Styling**: TailwindCSS 3.3+ with PostCSS
- **UI Components**: Radix UI primitives (@radix-ui/react-*)
- **Icons**: Lucide React + React Icons
- **HTTP Client**: Axios for API communication
- **Desktop**: Electron wrapper for cross-platform deployment

## Backend Stack
- **Framework**: FastAPI 0.104+ with Python 3.11+
- **Server**: Uvicorn with async support
- **Database**: Supabase (PostgreSQL) for user data
- **Vector Store**: ChromaDB Cloud 1.0.15 with persistent API keys
- **Authentication**: Supabase Auth with OAuth 2.0 (Google, Microsoft)
- **Payments**: Stripe 8.2+ for subscription billing
- **File Processing**: Multiple libraries for document parsing

## AI/ML Stack
- **LLM**: OpenAI GPT-4o API
- **Embeddings**: OpenAI text-embedding-3-large via ChromaDB Cloud
- **Vector Search**: ChromaDB Cloud with semantic similarity and relevance scoring
- **Document Processing**: PyPDF, python-docx, openpyxl, python-pptx
- **Vector Database**: Production-ready ChromaDB Cloud with persistent authentication

## Development Environment
- **Package Manager**: npm for frontend, pip for backend
- **Python Environment**: Virtual environment (venv) in server/venv/
- **Environment Variables**: .env files for configuration
- **CORS**: Configured for localhost development

## Common Commands

### Development Setup
```bash
# Full setup and start
npm run dev

# Install all dependencies
npm run install-all

# Setup Python virtual environment
call setup_venv.bat

# Start with virtual environment
call start_venv.bat
```

### Frontend Commands
```bash
cd client
npm run dev      # Start development server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

### Backend Commands
```bash
cd server
# With virtual environment
call venv\Scripts\activate.bat
python main.py   # Start FastAPI server (port 3001)

# Direct commands
pip install -r requirements.txt
python -c "from routes import auth; print('Auth OK')"
```

### Testing Commands
```bash
npm run test-api           # Test API connections
npm run test-integration   # Run integration tests

# ChromaDB Integration Testing
python test_chromadb_integration.py    # Full ChromaDB integration test suite
python test_chroma_cloud_direct.py     # Direct ChromaDB Cloud connection test
```

## API Architecture
- **Base URL**: http://localhost:3001
- **API Docs**: http://localhost:3001/docs (FastAPI auto-generated)
- **Health Check**: GET /health
- **Authentication**: JWT tokens via Supabase
- **File Upload**: Multipart form data support
- **WebSocket**: Real-time features support

## Environment Configuration
- **Client**: client/.env (Vite environment variables)
- **Server**: server/.env (Python environment variables)
- **Required APIs**: OpenAI, ChromaDB Cloud, Supabase, Stripe, OAuth providers

### ChromaDB Cloud Configuration
```env
CHROMA_API_KEY=ck-DJ4RxesjNMM7kdU2SnoW7bcW7aCDBksXMGE7htDWMJyG  # Persistent API key
CHROMA_TENANT_ID=d66de939-998f-4a7c-beaa-631552b609fb
CHROMA_DB_NAME=Briefly Cloud
CHROMA_CLOUD_URL=https://api.trychroma.com/v1
```

### Key Integration Notes
- **Persistent API Keys**: ChromaDB Cloud now supports persistent API keys (not session-based)
- **Production Ready**: 100% test success rate with full document indexing and context retrieval
- **Multi-Device Support**: Cloud-based vector storage enables cross-device document access
- **Graceful Fallback**: System continues to work if ChromaDB is temporarily unavailable

## Build System
- **Frontend**: Vite with TypeScript compilation and Tailwind processing
- **Backend**: Python with uvicorn ASGI server
- **Desktop**: Electron packaging for cross-platform distribution
- **Dependencies**: Automated installation via batch scripts