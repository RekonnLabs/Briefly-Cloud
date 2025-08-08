export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-4xl mx-auto text-center">
        <div className="mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4">
            Briefly Cloud
          </h1>
          <p className="text-xl md:text-2xl text-gray-600 mb-8">
            AI-Powered Document Assistant
          </p>
          <p className="text-lg text-gray-500 max-w-2xl mx-auto">
            Transform your documents into intelligent conversations with AI. 
            Built with Next.js 14, unified architecture eliminates CORS issues 
            and provides seamless integration.
          </p>
        </div>
        
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="text-3xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold mb-2">AI Integration</h3>
            <p className="text-gray-600">OpenAI GPT-4 Turbo with BYOK support</p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="text-3xl mb-4">📄</div>
            <h3 className="text-lg font-semibold mb-2">Multi-Format</h3>
            <p className="text-gray-600">PDF, DOCX, TXT, MD, CSV, XLSX, PPTX</p>
          </div>
          
          <div className="bg-white rounded-lg p-6 shadow-md">
            <div className="text-3xl mb-4">🚀</div>
            <h3 className="text-lg font-semibold mb-2">Unified Architecture</h3>
            <p className="text-gray-600">Next.js 14 with App Router (no CORS issues)</p>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-8 shadow-lg">
          <h2 className="text-2xl font-bold mb-4">Migration Status</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span>✅ Next.js Foundation Setup</span>
              <span className="text-green-600 font-semibold">Complete</span>
            </div>
            <div className="flex items-center justify-between">
              <span>⏳ Authentication System</span>
              <span className="text-yellow-600 font-semibold">Next</span>
            </div>
            <div className="flex items-center justify-between">
              <span>⏳ File Processing</span>
              <span className="text-gray-400 font-semibold">Pending</span>
            </div>
            <div className="flex items-center justify-between">
              <span>⏳ AI Chat System</span>
              <span className="text-gray-400 font-semibold">Pending</span>
            </div>
          </div>
        </div>
        
        <div className="mt-8 text-sm text-gray-500">
          <p>Built with ❤️ by RekonnLabs</p>
          <p>Unified Next.js Architecture • TypeScript • Tailwind CSS</p>
        </div>
      </div>
    </div>
  );
}
