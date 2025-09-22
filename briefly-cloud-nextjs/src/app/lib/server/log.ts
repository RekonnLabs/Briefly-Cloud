export function logReq(ctx: { route: string; method: string; userId?: string }) {
  const rid = Math.random().toString(36).slice(2, 10)
  console.log(`[${rid}] ${ctx.method} ${ctx.route} uid=${ctx.userId ?? 'anon'}`)
  return rid
}

export function logErr(rid: string, where: string, err: unknown, extra?: any) {
  console.error(`[${rid}] ${where} ERROR`, { err, extra })
}