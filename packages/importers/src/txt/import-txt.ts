export function splitTextIntoChunks(text: string): Array<{ text: string; locator: string }> {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk, index) => ({
      text: chunk,
      locator: `paragraph#${index + 1}`
    }));
}
