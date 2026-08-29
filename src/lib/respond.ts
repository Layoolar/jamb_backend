import type { Response } from 'express';
import type { ZodType } from 'zod';

/**
 * The single exit point for response bodies (PLAN §2.2).
 *
 * Zod strips keys a schema does not declare, so a row carrying `correctIndex`
 * cannot leak through a schema that omits it. This turns "don't leak the answer
 * key" from a code-review habit into a mechanical guarantee.
 *
 * A parse failure here is a 500 rather than a silent partial response — failing
 * loudly is strictly better than shipping an answer key.
 *
 * Rule: `correctIndex` appears in exactly one response schema in this codebase
 * (AnswerResult). Grep for it; two hits is a bug.
 */
export function send<T>(
  res: Response,
  schema: ZodType<T>,
  data: unknown,
  status = 200,
): void {
  res.status(status).json(schema.parse(data));
}
