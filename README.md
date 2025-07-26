# 🚀 Briefly Cloud - AI-Powered Productivity Assistant

> Transform your documents into intelligent conversations with AI

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-repo/briefly-cloud)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://python.org)
[![Node](https://img.shields.io/badge/node-18+-green.svg)](https://nodejs.org)

## 📋 Overview

Briefly Cloud is a cloud-native productivity assistant that uses advanced AI to help you interact with your documents, research, and knowledge base. Upload documents from cloud storage, ask questions, and get intelligent responses powered by GPT-4o and vector search technology.

### ✨ Key Features

- 🤖 **AI-Powered Chat** - Intelligent conversations about your documents using GPT-4o
- 📄 **Multi-Format Support** - PDF, DOCX, TXT, MD, CSV, XLSX, PPTX and more
- 🔍 **Semantic Search** - Vector-based search across your entire knowledge base
- ☁️ **Cloud Storage** - Google Drive and OneDrive integration
- 🔐 **Secure Auth** - OAuth 2.0 with Google and Microsoft
- 💳 **Subscription Tiers** - Stripe-powered billing system
- 📱 **Mobile PWA** - Progressive Web App with offline support
- 👥 **Team Ready** - Built for collaboration and sharing

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

Visit `http://localhost:5173` for the web app and `http://localhost:8000` for the API.

## 🔧 Required API Keys

You need to obtain API keys from these services:

### 🤖 **OpenAI** (Required)
- Get API key from: https://platform.openai.com/api-keys
- Add to `server/.env`: `OPENAI_API_KEY=sk-your-key`

### 🗄️ **Chroma Cloud** (Required)
- Sign up at: https://www.trychroma.com/
- Add to `server/.env`: `CHROMA_API_KEY=ck-your-key`

### 🗃️ **Supabase** (Required)
- Create project at: https://supabase.com/
- Add URL and keys to `server/.env`

### 💳 **Stripe** (Required)
- Get keys from: https://dashboard.stripe.com/
- Add secret key to `server/.env`
- Add public key to `client/.env`

### 🔐 **OAuth Services** (Required)
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
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/           # Utilities and API client
│   │   └── utils/         # Helper functions
│   ├── public/            # Static assets & PWA files
│   ├── .env.example       # Client environment template
│   └── package.json
├── server/                # FastAPI backend
│   ├── routes/            # API route handlers
│   ├── main.py           # Main server application
│   ├── vector_store.py   # Vector database operations
│   ├── requirements.txt  # Python dependencies
│   └── .env.example      # Server environment template
├── tests/                # Test suite
├── Docs/                 # Documentation
├── SETUP_GUIDE.md        # Detailed setup instructions
└── README.md             # This file
```

## 🔐 Security Features

- **OAuth 2.0** authentication with Google and Microsoft
- **JWT tokens** for secure API access
- **End-to-end encryption** for sensitive data
- **Rate limiting** to prevent abuse
- **Input validation** and sanitization
- **CORS protection** for cross-origin requests

## 📊 Subscription Tiers

| Tier | Price | Documents | Features |
|------|-------|-----------|----------|
| **Free** | $0/month | 10 docs | Basic chat, limited search |
| **Pro** | $9/month | 1,000 docs | Advanced AI, full search |
| **Team** | $29/month | Unlimited | Collaboration, sharing |
| **Enterprise** | $99/month | Unlimited | Custom AI, priority support |

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

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | User authentication |
| `POST` | `/auth/register` | User registration |
| `POST` | `/upload` | Document upload |
| `POST` | `/chat` | AI chat interface |
| `POST` | `/search` | Vector search |
| `GET` | `/conversations` | Chat history |
| `GET` | `/profile` | User profile |
| `GET` | `/health` | Health check |

## 📱 Mobile & PWA Support

Briefly Cloud includes Progressive Web App features:

- **Offline support** with service workers
- **Install prompts** for native app experience
- **Responsive design** for all screen sizes
- **Touch-optimized** interface

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
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
- **Troubleshooting**: `TROUBLESHOOTING_GUIDE.md`
- **Mobile Deployment**: `Docs/MOBILE_DEPLOYMENT_GUIDE.md`
- **API Documentation**: `Docs/PRD.md`

## 🆘 Support

- 📖 **Setup Issues**: Check `SETUP_GUIDE.md`
- 🔧 **API Problems**: Run `npm run test-api`
- 🐛 **Bugs**: Report via GitHub issues
- 💬 **Discussions**: Join our community
- 📧 **Email**: support@brieflycloud.com

## 🎯 Roadmap

### ✅ Phase 1: Core Features (Complete)
- Document processing and AI chat
- Vector search and authentication
- Mobile PWA support
- Cloud storage integration

### 🚧 Phase 2: Advanced Features (In Progress)
- Voice integration and audio processing
- Advanced analytics dashboard
- Real-time collaboration
- Multi-model AI support

### 📋 Phase 3: Enterprise (Planned)
- Custom AI training
- Advanced security features
- API integrations
- White-label solutions

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for GPT-4o API
- **Chroma** for vector database
- **Supabase** for backend services
- **Stripe** for payment processing
- **React** and **FastAPI** communities

---

**Built with ❤️ for the future of knowledge work**

⚠️ **Remember**: Configure your API keys in the `.env` files before starting! See `SETUP_GUIDE.md` for detailed instructions.

*Ready to transform how you work with documents? Configure your keys and get started!* 🌟

