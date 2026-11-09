export function splitMarkdownIntoChunks(text: string): Array<{ heading?: string; locator: string; text: string }> {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const chunks: Array<{ heading?: string; locator: string; text: string }> = [];
  const headings: Array<{ level: number; title: string }> = [];
  let buffer: string[] = [];
  let fence: { marker: string; length: number } | undefined;

  const flush = () => {
    appendChunk(chunks, headings, buffer);
    buffer = [];
  };

  for (const line of lines) {
    const fenceLine = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      buffer.push(line);
      if (fenceLine && fenceLine[1]![0] === fence.marker && fenceLine[1]!.length >= fence.length && !fenceLine[2]!.trim()) fence = undefined;
      continue;
    }
    if (fenceLine) {
      buffer.push(line);
      fence = { marker: fenceLine[1]![0]!, length: fenceLine[1]!.length };
      continue;
    }

    const headingLine = line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/);
    if (headingLine) {
      flush();
      const level = headingLine[1]!.length;
      const parentCount = headings.findIndex((heading) => heading.level >= level);
      headings.splice(parentCount < 0 ? headings.length : parentCount);
      headings.push({ level, title: headingLine[2]!.trim() });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    buffer.push(line);
  }

  flush();
  return chunks;
}

function appendChunk(chunks: Array<{ heading?: string; locator: string; text: string }>, headings: Array<{ level: number; title: string }>, buffer: string[]): void {
    const content = buffer.join("\n").trim();
    if (content) {
      const heading = headings.map(({ title }) => title).join(" > ") || undefined;
      const index = chunks.length + 1;
      chunks.push({ ...(heading ? { heading } : {}), locator: `${heading ?? "paragraph"}#${index}`, text: content });
    }
}
