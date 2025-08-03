# 🚀 Briefly Cloud – AI-Powered Productivity Assistant by RekonnLabs

Transform your documents into intelligent conversations with AI — powered by GPT-4 Turbo and cutting-edge vector search technology.

---

## Overview

**Briefly Cloud** is a desktop and cloud AI productivity assistant that enables intelligent conversations with your documents. It supports both OpenAI GPT-4 Turbo and local LLMs, document upload, smart search, and seamless cloud integration with Google Drive & OneDrive.

---

## ✨ Key Features

- 🤖 **Dual AI Support**: OpenAI GPT-4 Turbo or local language models (llama.cpp compatible)
- 📄 **Multi-Format Support**: PDF, DOCX, TXT, MD, CSV, XLSX, PPTX and more
- 🔍 **Vector Search**: ChromaDB-powered semantic search across documents
- 📁 **Local File Processing**: Folder indexing and direct upload
- ☁️ **Cloud Integration**: Google Drive and OneDrive OAuth
- 🛡️ **Authentication**: Supabase-powered user management
- 💳 **Subscription System**: Stripe billing with Free, Pro, and Pro BYOK tiers
- 🖥️ **Desktop App**: Electron-wrapped for cross-platform deployment
- 🧠 **LLM Management**: Local model selection & control
- 🚦 **Usage Tracking**: Tier-based limits and monitoring
- 🧑‍💻 **Onboarding**: Guided setup for new users
- 📱 **PWA**: Installable & mobile-ready

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
- Python 3.11+
- Configured .env files with your API keys

### Install & Run

```bash
# Install all dependencies (server + client)
npm run install-all

# Start development servers (frontend + backend)
npm run dev

Access the app: http://localhost:5173

API docs: http://localhost:8000/docs

Briefly_Cloud/
├── client/         # React frontend (Vite + TypeScript)
├── server/         # FastAPI backend & routes
├── tests/          # Test suites
├── Docs/           # Project documentation & specs
├── SETUP_GUIDE.md  # Setup & environment instructions
└── README.md


 Support & Contributions
Report issues or request features on GitHub Issues

Email: support@rekonnlabs.com

Contribute via pull requests (see CONTRIBUTING.md if available)

📄 License
This project is licensed under the MIT License — see the LICENSE file for details.

🙏 Acknowledgments
OpenAI — GPT-4 Turbo API
Chroma — Vector DB backend
Supabase — Auth & DB services
Stripe — Payment processing
FastAPI & React communities

Built with ❤️ by RekonnLabs — transforming knowledge work with AI.