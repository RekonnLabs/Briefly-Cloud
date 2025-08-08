# 🚀 Briefly Cloud – AI-Powered Productivity Assistant by RekonnLabs

Transform your documents into intelligent conversations with AI — powered by GPT-4 Turbo and cutting-edge vector search technology.

---

## Overview

**Briefly Cloud** is a unified Next.js AI productivity assistant that enables intelligent conversations with your documents. Built with a modern TypeScript architecture, it eliminates CORS issues and provides seamless integration between frontend and backend functionality. Supports OpenAI GPT-4 Turbo, document upload, smart search, and cloud integration with Google Drive & OneDrive.

---

## ✨ Key Features

- 🤖 **AI Integration**: OpenAI GPT-4 Turbo with BYOK (Bring Your Own Key) support
- 📄 **Multi-Format Support**: PDF, DOCX, TXT, MD, CSV, XLSX, PPTX and more
- 🔍 **Vector Search**: ChromaDB-powered semantic search across documents
- 📁 **File Processing**: Direct upload and cloud storage integration
- ☁️ **Cloud Integration**: Google Drive and OneDrive OAuth via NextAuth.js
- 🛡️ **Authentication**: NextAuth.js with Supabase backend
- 💳 **Subscription System**: Stripe billing with Free, Pro, and Pro BYOK tiers
- 🚀 **Unified Architecture**: Next.js 14 with App Router (no CORS issues)
- 🔒 **Type Safety**: End-to-end TypeScript from frontend to API routes
- 🚦 **Usage Tracking**: Tier-based limits and monitoring
- 🧑‍💻 **Developer Experience**: Single codebase with hot reload
- 📱 **PWA Ready**: Installable & mobile-optimized

---


## 💰 Subscription Pricing & Limits

| Tier         | Price      | Documents | Messages/mo | Storage | Features                               |
|--------------|------------|-----------|-------------|---------|----------------------------------------|
| **Free**     | $0         | 25        | 100         | 100 MB  | GPT-3.5 Turbo, basic chat, Google Drive|
| **Pro**      | $30/mo     | 500       | 400         | 1 GB    | GPT-4 Turbo, advanced search, Google/OneDrive|
| **Pro BYOK** | $15/mo     | 5,000     | 2,000       | 10 GB   | Bring your own OpenAI API key          |

*BYOK = Bring Your Own Key (user supplies OpenAI API key to reduce cost)*

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ & npm
- Configured .env.local file with your API keys

### Install & Run

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start unified development server
npm run dev
```

Access the app: http://localhost:3000

API routes available at: http://localhost:3000/api/*

### Project Structure

```
Briefly_Cloud/
├── app/                    # Next.js App Router
│   ├── api/               # API route handlers
│   │   ├── auth/          # NextAuth.js authentication
│   │   ├── upload/        # File upload endpoints
│   │   ├── embed/         # Document processing
│   │   ├── chat/          # AI chat functionality
│   │   └── storage/       # Cloud storage integration
│   ├── components/        # React components
│   ├── lib/               # Utility functions
│   └── (pages)/           # App Router pages
├── tests/                 # Test suites (Jest + Playwright)
├── docs/                  # Project documentation
└── README.md              # This file
```


 Support & Contributions
Report issues or request features on GitHub Issues

Email: support@rekonnlabs.com

Contribute via pull requests (see CONTRIBUTING.md if available)

📄 License
This project is licensed under the MIT License — see the LICENSE file for details.

## 🏗️ Architecture

**Unified Next.js Application** deployed on Vercel:
- **Frontend**: React 18 with TypeScript and TailwindCSS
- **Backend**: Next.js API routes with TypeScript
- **Authentication**: NextAuth.js with Google/Microsoft OAuth
- **Database**: Supabase PostgreSQL with Row Level Security
- **Vector Search**: ChromaDB Cloud for document embeddings
- **AI**: OpenAI GPT-4 Turbo with embedding generation
- **Payments**: Stripe for subscription management

## 📚 Documentation

- [Development Setup](docs/DEVELOPMENT_SETUP.md) - Complete setup guide
- [Migration Guide](docs/MIGRATION_GUIDE.md) - Migration from legacy architecture
- [API Reference](docs/API_REFERENCE.md) - API endpoints documentation
- [OAuth Setup](OAUTH_SETUP_GUIDE.md) - OAuth provider configuration

## 🙏 Acknowledgments

- **OpenAI** — GPT-4 Turbo API & Embeddings
- **Vercel** — Unified deployment platform
- **Next.js** — Full-stack React framework
- **ChromaDB** — Vector database backend
- **Supabase** — Auth & database services
- **Stripe** — Payment processing
- **NextAuth.js** — Authentication library

Built with ❤️ by RekonnLabs — transforming knowledge work with AI.