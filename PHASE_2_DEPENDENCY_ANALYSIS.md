# 🔍 Phase 2: Dependency Analysis & Optimization

## 📊 **Current Dependency Analysis**

### **Production Dependencies (29 packages)**
```json
{
  "@azure/msal-node": "^3.7.0",           // ✅ KEEP - Microsoft OAuth
  "@radix-ui/react-*": "11 packages",     // ✅ KEEP - UI components
  "@sentry/nextjs": "^8.15.0",            // 🤔 REVIEW - Error tracking
  "@supabase/ssr": "^0.7.0",              // ✅ KEEP - Auth
  "@supabase/supabase-js": "^2.56.0",     // ✅ KEEP - Database
  "@vercel/analytics": "^1.2.2",          // 🤔 REVIEW - Analytics
  "axios": "^1.11.0",                     // ✅ KEEP - HTTP client
  "chromadb": "^3.0.10",                  // ✅ KEEP - Vector DB
  "class-variance-authority": "^0.7.1",   // ✅ KEEP - CSS utilities
  "clsx": "^2.1.1",                       // ✅ KEEP - CSS utilities
  "date-fns": "^4.1.0",                   // ✅ KEEP - Date utilities
  "dotenv": "^17.2.1",                    // ✅ KEEP - Environment
  "formidable": "^3.5.4",                 // ✅ KEEP - File uploads
  "googleapis": "^155.0.0",               // ✅ KEEP - Google Drive
  "lru-cache": "^10.2.0",                 // ✅ KEEP - Caching
  "lucide-react": "^0.537.0",             // ✅ KEEP - Icons
  "mammoth": "^1.10.0",                   // ✅ KEEP - DOCX parsing
  "next": "15.4.6",                       // ✅ KEEP - Framework
  "openai": "^5.12.0",                    // ✅ KEEP - AI
  "pdf-parse": "^1.1.1",                  // ✅ KEEP - PDF parsing
  "react": "19.1.0",                      // ✅ KEEP - Framework
  "react-dom": "19.1.0",                  // ✅ KEEP - Framework
  "stripe": "^18.4.0",                    // ✅ KEEP - Payments
  "tailwind-merge": "^3.3.1",             // ✅ KEEP - CSS utilities
  "xlsx": "^0.18.5",                      // ✅ KEEP - Excel parsing
  "zod": "^3.25.76"                       // ✅ KEEP - Validation
}
```

### **Development Dependencies (22 packages)**
```json
{
  "@eslint/eslintrc": "^3",               // ✅ KEEP - Linting
  "@playwright/test": "^1.54.2",          // 🤔 REVIEW - E2E testing
  "@tailwindcss/postcss": "^4",           // ✅ KEEP - CSS
  "@testing-library/*": "2 packages",     // 🤔 REVIEW - Testing
  "@types/*": "6 packages",               // ✅ KEEP - TypeScript
  "@typescript-eslint/*": "2 packages",   // ✅ KEEP - TypeScript linting
  "audit-ci": "^7.1.0",                   // 🤔 REVIEW - Security auditing
  "eslint": "^9",                         // ✅ KEEP - Linting
  "eslint-config-next": "15.4.6",         // ✅ KEEP - Next.js linting
  "eslint-plugin-no-secrets": "^1.0.2",   // 🤔 REVIEW - Security linting
  "eslint-plugin-security": "^3.0.1",     // 🤔 REVIEW - Security linting
  "jest": "^30.0.5",                      // 🤔 REVIEW - Testing
  "jest-*": "3 packages",                 // 🤔 REVIEW - Testing
  "playwright": "^1.54.2",                // 🤔 REVIEW - E2E testing
  "snyk": "^1.1293.1",                    // 🤔 REVIEW - Security scanning
  "supertest": "^7.0.0",                  // 🤔 REVIEW - API testing
  "tailwindcss": "^4",                    // ✅ KEEP - CSS framework
  "typescript": "^5"                      // ✅ KEEP - TypeScript
}
```

## 🎯 **Optimization Recommendations**

### **Phase 2A: Keep Essential, Review Optional**

#### **✅ Essential Dependencies (Keep)**
- **Core Framework**: Next.js, React, TypeScript
- **UI Components**: All Radix UI components (well-optimized)
- **Authentication**: Supabase packages
- **AI/ML**: OpenAI, ChromaDB
- **File Processing**: PDF-parse, Mammoth, XLSX
- **Cloud Integration**: Google APIs, Azure MSAL
- **Payments**: Stripe
- **Utilities**: Date-fns, Axios, Zod, LRU-cache

#### **🤔 Review for MVP (Optional)**
- **@sentry/nextjs** - Error tracking (nice-to-have)
- **@vercel/analytics** - Analytics (nice-to-have)
- **Testing packages** - Comprehensive but heavy for MVP
- **Security packages** - Important but can be simplified

#### **❌ Potential Removals (Post-Analysis)**
- Heavy testing frameworks if not actively used
- Redundant security tools
- Unused ESLint plugins

### **Phase 2B: Script Optimization**

#### **🔍 Current Scripts Analysis**
- **Total Scripts**: 50+ scripts
- **Essential**: ~15 scripts
- **Testing**: ~20 scripts
- **Security**: ~15 scripts

#### **Optimization Strategy**
1. **Keep Core Scripts**: dev, build, start, lint, type-check
2. **Simplify Testing**: Reduce to essential test commands
3. **Streamline Security**: Keep critical security checks only
4. **Remove Unused**: Backup, monitoring, complex pipelines

## 📈 **Expected Benefits**

### **Bundle Size Reduction**
- **Current**: ~500MB node_modules
- **Target**: ~300MB node_modules
- **Savings**: ~40% reduction

### **Build Performance**
- **Current**: ~3.0s build time
- **Target**: ~2.0s build time
- **Improvement**: ~33% faster builds

### **Development Experience**
- **Faster**: npm install
- **Cleaner**: package.json
- **Focused**: Essential tools only

## 🚀 **Next Steps**

1. **Analyze Script Usage** - Identify unused scripts
2. **Test Dependency Removal** - Safe removal testing
3. **Bundle Analysis** - Measure impact
4. **Performance Testing** - Verify improvements
5. **Documentation Update** - Update README

## 🎯 **Success Metrics**

- ✅ **Build Success**: Maintain successful builds
- ✅ **Feature Parity**: All MVP features working
- ✅ **Performance**: Faster build times
- ✅ **Size**: Smaller bundle size
- ✅ **Maintainability**: Cleaner dependencies