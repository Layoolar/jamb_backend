import { hash, verify } from '@node-rs/argon2';

/**
 * argon2id at OWASP-recommended parameters. @node-rs/argon2 ships prebuilt
 * binaries, so there is no node-gyp toolchain requirement on Windows.
 */
const OPTS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTS);
}

export async function verifyPassword(
  storedHash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTS);
  } catch {
    // A malformed stored hash is a failed login, not a 500.
    return false;
  }
}
