# 🚀 Briefly Cloud - AI-Powered Productivity Assistant

> Transform your documents into intelligent conversations with AI

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-repo/briefly-cloud)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://python.org)
[![Node](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org)

## 📋 Overview

Briefly Cloud is a desktop AI productivity assistant that enables intelligent conversations with your documents. It features both cloud-based services and local LLM support, allowing you to upload documents, ask questions, and get AI-powered responses using either OpenAI's GPT-4o or local language models.

### ✨ Key Features

- 🤖 **Dual AI Support** - Use OpenAI GPT-4o or local language models (llama.cpp compatible)
- 📄 **Multi-Format Support** - PDF, DOCX, TXT, MD, CSV, XLSX, PPTX and more
- 🔍 **Vector Search** - ChromaDB-powered semantic search across documents
- 📁 **Local File Processing** - Direct folder indexing and document upload
- ☁️ **Cloud Integration** - Google Drive and OneDrive OAuth support
- � **Autherntication** - Supabase-powered user management
- � ***Subscription System** - Stripe billing with multiple tiers
- �️* **Desktop App** - Electron-wrapped for cross-platform deployment
- 🧠 **LLM Management** - Built-in interface for local model selection and control
- 🚦 **Usage Tracking** - Tier-based limits and monitoring
- � **Onbboarding** - Guided setup for new users

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Python** 3.11+
- **API keys** for required services (see Setup Guide)

### ⚠️ **IMPORTANT: Configuration Required**

This package does **NOT** include API keys for security reasons. You must configure your own API keys before using Briefly Cloud.

### Installation

1. **Extract and Setup**
```bash
unzip Briefly_Cloud_CLEAN.zip
cd Briefly_Cloud
```

2. **Configure Environment** (Required)
```bash
# Copy environment templates
cp server/.env.example server/.env
cp client/.env.example client/.env

# Edit with your API keys
nano server/.env  # Add your API keys here
nano client/.env  # Add client settings
```

3. **Install Dependencies**
```bash
npm run install-all
```

4. **Test Configuration**
```bash
npm run test-api  # Verify your API keys work
```

5. **Start Development**
```bash
npm run dev
```

Visit `http://localhost:5173` for the web app and `http://localhost:3001` for the API.

## � Currenet Status

### ✅ **Working Features**
- **Local Chat**: Chat interface with local LLM support
- **Document Processing**: Upload and index documents (PDF, DOCX, TXT, etc.)
- **Vector Search**: ChromaDB-powered semantic search across documents
- **Settings Management**: LLM settings, theme preferences, folder selection
- **File Management**: Local file upload and processing
- **Conversation History**: Persistent chat conversations
- **Debug Tools**: Built-in debugging and testing interfaces

### 🚧 **Cloud Features** (Requires API Keys)
- **Authentication**: Supabase-powered user management
- **Cloud Storage**: Google Drive and OneDrive integration
- **Subscription Billing**: Stripe payment processing
- **Usage Tracking**: Tier-based limits and monitoring
- **OpenAI Integration**: GPT-4o cloud AI responses

### 🎯 **Development Mode**
The application runs in development mode by default and includes:
- Test mode accessible via `?test=1` URL parameter
- Debug panel for troubleshooting
- Local file processing without cloud dependencies
- Comprehensive error handling and logging

## 🔧 Required API Keys

You need to obtain API keys from these services:

### 🤖 **OpenAI** (Optional - for cloud AI)
- Get API key from: https://platform.openai.com/api-keys
- Add to `server/.env`: `OPENAI_API_KEY=sk-your-key`
- **Note**: Can use local LLMs instead via LLM Settings

### 🗄️ **ChromaDB Cloud** (Required for vector search)
- Sign up at: https://www.trychroma.com/
- Add to `server/.env`: `CHROMA_API_KEY=ck-your-key`

### 🗃️ **Supabase** (Required for authentication)
- Create project at: https://supabase.com/
- Add URL and keys to `server/.env`

### 💳 **Stripe** (Required for billing)
- Get keys from: https://dashboard.stripe.com/
- Add secret key to `server/.env`
- Add public key to `client/.env`

### 🔐 **OAuth Services** (Required for cloud storage)
- **Google**: https://console.cloud.google.com/
- **Microsoft**: https://portal.azure.com/

📖 **Detailed setup instructions**: See `SETUP_GUIDE.md`

## 🧪 Testing

### Validate API Keys
```bash
npm run test-api
```

### Full Integration Test
```bash
npm run test-integration
```

### Run All Tests
```bash
npm test
```

## 📁 Project Structure

```
Briefly_Cloud/
├── client/                 # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   ├── ui/         # Radix UI components
│   │   │   ├── App.tsx     # Main application
│   │   │   ├── ChatWindow.tsx # Chat interface
│   │   │   ├── CloudSettings.tsx # Cloud storage settings
│   │   │   ├── LlmSettings.tsx # Local LLM management
│   │   │   ├── OnboardingFlow.tsx # User onboarding
│   │   │   ├── UsageLimits.tsx # Usage tracking UI
│   │   │   └── ...         # Other components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and API client
│   │   └── utils/          # Helper functions
│   ├── public/             # Static assets & PWA files
│   └── package.json
├── server/                 # FastAPI backend
│   ├── routes/             # API route handlers
│   │   ├── auth.py         # Authentication endpoints
│   │   ├── chat.py         # Chat/conversation endpoints
│   │   ├── embed.py        # Document embedding endpoints
│   │   ├── storage.py      # Cloud storage endpoints
│   │   └── usage.py        # Usage tracking endpoints
│   ├── utils/              # Backend utilities
│   ├── main.py             # Main server application
│   ├── vector_store.py     # ChromaDB vector operations
│   └── requirements.txt    # Python dependencies
├── tests/                  # Test suite
├── test_files/             # Sample documents for testing
├── Docs/                   # Project documentation
├── data/                   # Application data files
├── uploads/                # File upload directory
├── *.bat                   # Windows batch scripts
└── README.md               # This file
```

## 🔐 Security Features

- **OAuth 2.0** authentication with Google and Microsoft
- **JWT tokens** for secure API access
- **End-to-end encryption** for sensitive data
- **Rate limiting** to prevent abuse
- **Input validation** and sanitization
- **CORS protection** for cross-origin requests

## 📊 Subscription Tiers

| Tier            | Price      | Documents   | Features                        |
|-----------------|------------|-------------|---------------------------------|
| **Free**        | $0/month   | 10 docs     | Basic chat, limited search      |
| **Pro**         | $30/month  | 1,000 docs  | Advanced AI, full search        |
| **Pro (BYOK)**  | $15/month  | 1,000 docs  | Bring Your Own Key, full search |
| **Team**        | Coming Soon| -           | Collaboration, sharing          |
| **Enterprise**  | Coming Soon| -           | Custom AI, priority support     |

## 🛠️ Development

### Available Scripts

```bash
npm run dev          # Start development servers
npm run build        # Build for production
npm run preview      # Preview production build
npm run install-all  # Install all dependencies
npm run test-api     # Test API connections
npm run test-integration  # Run integration tests
```

### API Endpoints

| Method | Endpoint                    | Description                    |
|--------|-----------------------------|--------------------------------|
| `GET`  | `/health`                   | Health check                   |
| `GET`  | `/api/settings`             | Get application settings       |
| `POST` | `/api/settings`             | Save application settings      |
| `POST` | `/api/chat`                 | AI chat with context           |
| `GET`  | `/api/conversations`        | Get conversation history       |
| `GET`  | `/api/conversations/{id}`   | Get specific conversation      |
| `DELETE` | `/api/conversations/{id}` | Delete conversation            |
| `POST` | `/api/upload`               | Upload and process files       |
| `GET`  | `/api/files`                | Get uploaded files list        |
| `POST` | `/api/parse_folder`         | Index folder for search        |
| `GET`  | `/api/vector_stats`         | Vector store statistics        |

**Cloud API Routes** (when available):
- `/api/auth/*` - Authentication endpoints
- `/api/storage/*` - Cloud storage integration  
- `/api/embed/*` - Document embedding services
- `/api/usage/*` - Usage tracking and limits

## 📱 Mobile & PWA Support

Briefly Cloud includes Progressive Web App features:

- **Offline support** with service workers
- **Install prompts** for native app experience
- **Responsive design** for all screen sizes
- **Touch-optimized** interface

## 🧠 Local LLM Support

Briefly Cloud supports both cloud-based and local language models:

### Local LLM Features
- **Model Management**: Built-in UI for selecting and managing local models
- **llama.cpp Compatible**: Supports any model compatible with llama.cpp server
- **GPU Detection**: Automatic detection of CUDA, MPS, and CPU backends
- **Default Model**: OpenChat model configured as default
- **API Endpoint**: Local server runs on `http://127.0.0.1:8080/v1/chat/completions`

### Usage Modes
- **Cloud Mode**: Use OpenAI GPT-4o with API key
- **Local Mode**: Run models locally via LLM Settings interface
- **Hybrid Mode**: Switch between cloud and local as needed

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
# Start production server (configure production environment first)
npm start
```

### Environment Variables for Production

Ensure all environment variables are set for production:
- Replace test API keys with production keys
- Enable HTTPS for all services
- Configure proper CORS origins
- Set up monitoring and logging

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📚 Documentation

- **Setup Guide**: `SETUP_GUIDE.md` - **Start here for configuration**
- **Production Checklist**: `PRODUCTION_READINESS_CHECKLIST.md`
- **Troubleshooting**: `TROUBLESHOOTING_GUIDE.md`
- **Testing Guide**: `TESTING_CHECKLIST.md`
- **API Documentation**: Auto-generated at `http://localhost:3001/docs`

## 🆘 Support

- 📖 **Setup Issues**: Check `SETUP_GUIDE.md`
- 🔧 **API Problems**: Run `npm run test-api`
- 🧪 **Integration Tests**: Run `npm run test-integration`
- � ***Bugs**: Report via GitHub issues
- � **EDiscussions**: Join our community

## 🎯 Roadmap

### ✅ Phase 1: Core Desktop Features (Complete)
- Local document processing and AI chat
- Vector search with ChromaDB
- Local LLM support with llama.cpp
- File upload and folder indexing
- Settings management and themes

### 🚧 Phase 2: Cloud Integration (In Progress)
- User authentication with Supabase
- Cloud storage integration (Google Drive, OneDrive)
- Subscription billing with Stripe
- Usage tracking and tier management
- OpenAI GPT-4o integration

### 📋 Phase 3: Advanced Features (Planned)
- Real-time collaboration
- Advanced analytics dashboard
- Voice integration and audio processing
- Mobile PWA optimization
- API integrations and webhooks

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **ChromaDB** for vector database and semantic search
- **FastAPI** for the robust Python backend framework
- **React** and **Vite** for the modern frontend experience
- **Radix UI** for accessible component primitives
- **llama.cpp** for local LLM inference capabilities
- **OpenAI** for GPT-4o API integration
- **Supabase** for authentication services
- **Stripe** for payment processing

---

**Built with ❤️ for the future of knowledge work**
