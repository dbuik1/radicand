/**
 * Minimal ambient declaration for `speech-rule-engine`.
 *
 * The package's `main` entry (`lib/sre.js`) is a pre-built bundle that ships no
 * type declarations, so TypeScript needs the surface we actually use. We drive
 * SRE via a dynamic `import()` and only call the functions below.
 */
declare module 'speech-rule-engine' {
  export function setupEngine(
    feature: Record<string, string | boolean>,
  ): Promise<string>;
  export function engineReady(): Promise<unknown>;
  export function toSpeech(expr: string): string;
  export const version: string;
}
