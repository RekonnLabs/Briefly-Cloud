export const runtime = 'nodejs'

import { createServerClient } from '@supabase/ssr'

function getCookie(req: Request, name: string) {
  const raw = req.headers.get('cookie') || ''
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='))
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined
}

export async function GET(req: Request) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: { 
        get: (n) => getCookie(req, n), 
        set: () => {}, 
        remove: () => {} 
      } 
    }
  )

  const { data, error } = await supabase.auth.getUser()
  
  return new Response(
    JSON.stringify({ 
      user: data?.user ?? null, 
      error: error?.message ?? null 
    }), 
    {
      headers: { 
        'content-type': 'application/json', 
        'cache-control': 'no-store' 
      },
    }
  )
}
