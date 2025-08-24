import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/app/lib/supabase-admin"

async function check(name: string, fn: () => Promise<any>) {
  try { 
    await fn()
    return { name, status: "healthy" } 
  } catch (e: any) { 
    return { name, status: "unhealthy", error: e?.message } 
  }
}

export async function GET() {
  const results = await Promise.all([
    check("database", async () => {
      // Simple SELECT 1 equivalent
      const { data, error } = await supabaseAdmin
        .from('app.users')
        .select('id')
        .limit(1)
      if (error) throw error
    }),
    check("vector", async () => {
      // Check if vector store factory is available
      const { isVectorStoreAvailable } = await import("@/app/lib/vector/vector-store-factory")
      const available = await isVectorStoreAvailable()
      if (!available) throw new Error("Vector store not available")
    }),
    check("openai", async () => {
      // Test OpenAI connection with a minimal request
      const openai = await import("@/app/lib/openai")
      // Just check if we can create the client (doesn't make API call)
      if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API key not configured")
    }),
    check("stripe", async () => {
      // Check Stripe configuration
      if (!process.env.STRIPE_SECRET_KEY) throw new Error("Stripe secret key not configured")
      if (!process.env.STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook secret not configured")
    }),
    check("supabase", async () => {
      // Test Supabase admin connection
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 })
      if (error) throw error
    }),
  ])
  
  const ok = results.every(r => r.status === "healthy")
  return NextResponse.json({ 
    status: ok ? "healthy" : "degraded", 
    results, 
    ts: new Date().toISOString() 
  }, { 
    status: ok ? 200 : 503 
  })
}