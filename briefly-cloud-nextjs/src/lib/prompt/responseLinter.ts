export function lintResponse(text: string): string {
  return text?.trim?.() ?? ''
}

export function enforce(text: string): string {
  return lintResponse(text)
}