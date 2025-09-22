export function lintResponse(text: string): { output: string; rewritten: boolean } {
  const cleaned = text?.trim?.() ?? ''
  return {
    output: cleaned,
    rewritten: cleaned !== text
  }
}

export function enforce(text: string): { output: string; rewritten: boolean } {
  return lintResponse(text)
}
