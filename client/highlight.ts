import { useEffect, useMemo, useState } from "react";
import { WorkQueue } from "./work-queue";
import { useRpc } from "@getpaseo/plugin/client";
import { highlightRpc, type HighlightLine, type HighlightToken } from "../shared/highlight-rpc";

export type { HighlightLine, HighlightToken };

export interface HighlightRequest {
  code: string;
  language?: string;
  filename?: string;
  dark: boolean;
  diffBodyCode?: string;
}

export interface HighlightResponse {
  lines: HighlightLine[] | null;
  diffLines: HighlightLine[] | null;
  [Symbol.iterator]?(): Iterator<HighlightLine[] | null>;
}

function makeResponse(
  lines: HighlightLine[] | null,
  diffLines: HighlightLine[] | null = null,
): HighlightResponse {
  return {
    lines,
    diffLines,
    *[Symbol.iterator]() {
      yield lines;
      yield diffLines;
    },
  };
}

const EMPTY_RESPONSE: HighlightResponse = makeResponse(null, null);

/**
 * Grammars live on the daemon, so every block pays one round trip. The cache
 * makes that trip once per distinct block: ten mounts of the same snippet in a
 * transcript share one answer, and a remount reads it back without a flash of
 * unhighlighted text.
 */
const CACHE_LIMIT = 200;

/** A null entry marks a key the daemon could not answer, so it is not retried. */
const cache = new Map<string, HighlightResponse | null>();
const queue = new WorkQueue<void>(2);
const MAX_CACHE_CHARS = 2_000_000;
let cacheChars = 0;
const cacheSizes = new Map<string, number>();

/**
 * Hints the daemon answers unhighlighted on purpose. The author asked for plain
 * text, so an unhighlighted answer to one of these is the right answer and the
 * component must not colour it with the tokeniser instead.
 */
const PLAIN_HINTS: Record<string, true> = { plaintext: true, text: true, txt: true };

function isPlainHint(language: string | undefined): boolean {
  return language !== undefined && PLAIN_HINTS[language.trim().toLowerCase()] === true;
}

// Exact text keys prevent a hash collision from displaying another block's code.
function cacheKey(request: HighlightRequest): string {
  return JSON.stringify([request.dark, request.language ?? "", request.filename ?? "", request.code, request.diffBodyCode ?? ""]);
}

function remember(key: string, response: HighlightResponse | null): void {
  const size = key.length + JSON.stringify(response).length;
  if (size > MAX_CACHE_CHARS) return;
  cacheChars -= cacheSizes.get(key) ?? 0;
  cache.set(key, response);
  cacheSizes.set(key, size);
  cacheChars += size;
  while (cache.size > CACHE_LIMIT || cacheChars > MAX_CACHE_CHARS) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cacheChars -= cacheSizes.get(oldest) ?? 0;
    cacheSizes.delete(oldest);
    cache.delete(oldest);
  }
}

/**
 * A daemon without this handler, or one older than this contract, answers with
 * something else entirely. Reject that answer rather than render from it.
 */
function parseLines(rawLines: unknown): HighlightLine[] | null {
  if (!Array.isArray(rawLines)) return null;
  const lines: HighlightLine[] = [];
  for (const rawLine of rawLines) {
    const candidateLine: unknown = rawLine;
    if (!Array.isArray(candidateLine)) return null;
    const line: HighlightToken[] = [];
    for (const rawToken of candidateLine) {
      const token: unknown = rawToken;
      if (typeof token !== "object" || token === null) return null;
      if (!("text" in token) || typeof token.text !== "string") return null;
      const rawColor: unknown = "color" in token ? token.color : null;
      const color = typeof rawColor === "string" ? rawColor : rawColor === null ? null : undefined;
      if (color === undefined) return null;
      line.push({
        text: token.text,
        color,
        bold: "bold" in token && token.bold === true,
        italic: "italic" in token && token.italic === true,
      });
    }
    lines.push(line);
  }
  return lines;
}

/**
 * A daemon without this handler, or one older than this contract, answers with
 * something else entirely. Reject that answer rather than render from it.
 */
function readResponse(answer: unknown, allowPlain: boolean): HighlightResponse | null {
  if (typeof answer !== "object" || answer === null || !("lines" in answer)) return null;

  // A null language means the daemon sent the text back unhighlighted: no
  // grammar matched, or a size guard tripped on a huge or minified block. The
  // tokeniser in the component still colours that text, so treat that as no
  // answer and keep the fallback. A plain-text hint is the exception: plain is
  // what was asked for. Either way the key is cached, so nothing is retried.
  const language: unknown = "language" in answer ? answer.language : undefined;
  if (language !== null && typeof language !== "string") return null;
  if (language === null && !allowPlain) return null;

  const lines = parseLines(answer.lines);
  if (lines === null) return null;

  let diffLines: HighlightLine[] | null = null;
  if ("diffLines" in answer && answer.diffLines !== undefined && answer.diffLines !== null) {
    diffLines = parseLines(answer.diffLines);
  }

  return makeResponse(lines, diffLines);
}

type HighlightCall = (input: {
  code: string;
  language?: string;
  filename?: string;
  dark: boolean;
  diffBodyCode?: string;
}) => Promise<unknown>;

/**
 * The daemon's tokens for this block, or null while none are available. Null is
 * the caller's cue to keep drawing its own fallback: it covers the first paint,
 * a language the daemon cannot highlight, and a call that failed.
 */
export function useHighlightedLines(request: HighlightRequest): HighlightResponse {
  const call: HighlightCall = useRpc(highlightRpc);
  const { code, language, filename, dark, diffBodyCode } = request;
  const key = useMemo(() => code.length > 0 && code.length <= 100_000 && !isPlainHint(language)
    ? cacheKey({ code, language, filename, dark, diffBodyCode }) : null,
    [code, language, filename, dark, diffBodyCode]);
  // Reading the cache during render, not in an effect, is what removes the
  // unhighlighted frame on a block that was tokenised once already.
  const cached = key !== null ? (cache.get(key) ?? null) : null;
  const [, bumpRevision] = useState(0);

  useEffect(() => {
    if (key === null || cache.has(key)) return;
    let mounted = true;
    let release: (() => void) | undefined;
    // A changing code block paints immediately with the fallback. Only a
    // stable 250ms snapshot enters the two-request queue.
    const timer = setTimeout(() => {
      const lease = queue.acquire(key, async () => {
        if (cache.has(key)) return;
        const answer = await call({ code, language, filename, dark, diffBodyCode });
        remember(key, readResponse(answer, isPlainHint(language)));
      });
      release = lease.release;
      void lease.promise.then(() => {
        if (mounted) bumpRevision((revision) => revision + 1);
      }).catch(() => {}); // Transient errors are not cached; remount can retry.
    }, 250);
    return () => {
      mounted = false;
      clearTimeout(timer);
      release?.();
    };
  }, [key, call, code, language, filename, dark, diffBodyCode]);

  return cached ?? EMPTY_RESPONSE;
}
