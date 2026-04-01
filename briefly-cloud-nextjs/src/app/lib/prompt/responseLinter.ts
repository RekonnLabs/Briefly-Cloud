export function lintResponse(text: string): { output: string; rewritten: boolean } {
  const original = text?.trim?.() ?? ''

  let output = original

  // Strip markdown heading markers (###, ##, #) that Llama outputs but the chat
  // UI does not render — they appear as raw "### Heading Text" to the user.
  // Converts "### Contract Summary" → "Contract Summary" (preserves the text).
  output = output.replace(/^#{1,6}\s+/gm, '')

  // Collapse any runs of 3+ blank lines down to 2 (keeps paragraph spacing clean)
  output = output.replace(/\n{3,}/g, '\n\n').trim()

  return {
    output,
    rewritten: output !== original
  }
}

export function enforce(text: string): { output: string; rewritten: boolean } {
  return lintResponse(text)
}
