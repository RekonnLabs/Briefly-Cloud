import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET() {
  const jar = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (cookies) => {
          cookies.forEach(({ name, value, options }) => {
            jar.set(name, value, options)
          })
        },
      },
    }
  )
  const { data } = await supabase.auth.getUser()
  return Response.json({ hasAccess: !!data.user })
}
