import { z } from "zod"
import { NextResponse } from "next/server"

export const withValidatedJson = <T extends z.ZodTypeAny>(schema: T, handler: (data: z.infer<T>) => Promise<Response>) =>
  async (req: Request) => {
    const json = await req.json().catch(() => null)
    const parsed = schema.safeParse(json)
    if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
    return handler(parsed.data)
  }
