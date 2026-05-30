/**
 * JSONL serializer for the training corpus.
 *
 * Output format is intentionally narrow and stable so external tooling
 * (Hugging Face datasets, label-studio import) can consume it without
 * conditional logic. One JSON object per line. Newline-stripping in
 * `text` fields ensures the format isn't broken by content.
 *
 * Schema per line:
 *   {
 *     id: string,                      // stable sample id
 *     split: "train" | "val" | "test",
 *     source_format: "pdf" | "docx" | "image" | "txt",
 *     text: string,                    // PII-redacted raw text
 *     labels: {                        // null for unlabeled samples
 *       contact: {...} | null,
 *       summary: string | null,
 *       skills: string[] | null,
 *       experience: [...] | null,
 *       education: [...] | null,
 *       projects: [...] | null,
 *       certifications: [...] | null
 *     } | null,
 *     layout_hints: object | null
 *   }
 */

export interface ExportableSample {
  id: string;
  splitGroup: string;
  sourceFileType: string;
  redactedText: string;
  structuredLabel: unknown;
  layoutHints: unknown;
}

export interface ExportLine {
  id: string;
  split: string;
  source_format: string;
  text: string;
  labels: unknown;
  layout_hints: unknown;
}

export function toExportLine(sample: ExportableSample): ExportLine {
  return {
    id: sample.id,
    split: sample.splitGroup,
    source_format: sample.sourceFileType,
    // Replace literal newlines that would break JSONL on broken downstream
    // parsers. JSON.stringify itself escapes them; this is belt-and-suspenders
    // for tools that read line-by-line before JSON-parsing.
    text: String(sample.redactedText || ''),
    labels: sample.structuredLabel ?? null,
    layout_hints: sample.layoutHints ?? null,
  };
}

export function serializeJsonl(samples: Iterable<ExportableSample>): string {
  const out: string[] = [];
  for (const s of samples) {
    out.push(JSON.stringify(toExportLine(s)));
  }
  return out.join('\n') + (out.length > 0 ? '\n' : '');
}

/**
 * Async generator variant — yields one line at a time so callers can
 * stream a large export to disk / response without materializing the
 * whole corpus in memory.
 */
export async function* streamJsonl(samples: AsyncIterable<ExportableSample>): AsyncIterable<string> {
  for await (const s of samples) {
    yield JSON.stringify(toExportLine(s)) + '\n';
  }
}
