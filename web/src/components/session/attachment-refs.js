const ATTACHMENT_RE = /^\[Attached file: (.+) \(([^,()]+), (\d+) bytes\)\]$/;

/**
 * Extract attachment reference lines from user message text.
 * @param {string} text
 * @returns {{ text: string, refs: Array<{path: string, name: string, mime: string, size: number}> }}
 */
export function extractAttachmentRefs(text) {
  const lines = text.split('\n');
  const refs = [];
  const keep = [];

  for (const line of lines) {
    const match = line.match(ATTACHMENT_RE);
    if (match) {
      const [, path, mime, size] = match;
      const name = path.split(/[\\/]/).pop();
      refs.push({ path, name, mime, size: Number(size) });
    } else {
      keep.push(line);
    }
  }

  let result = keep.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');
  result = result.trimEnd();
  return { text: result, refs };
}
