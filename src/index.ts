// Must run before express is imported so Sentry can instrument it.
import { Sentry, initSentry } from './lib/sentry.js';

const sentryOn = initSentry();

import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { db } from './db/index.js';
import { env, isProd } from './env.js';
import { AppError } from './lib/errors.js';
import { authRouter } from './routes/auth.js';
import { matchRouter } from './routes/matches.js';
import { contentRouter } from './routes/questions.js';
import { userRouter } from './routes/users.js';
import { startCron } from './cron.js';

const app = express();

app.set('trust proxy', 1); // Behind Caddy in production.
app.use(helmet());
app.use(express.json({ limit: '64kb' }));
app.use(
  pinoHttp({
    level: env.LOG_LEVEL,
    // Never log tokens or passwords, even at trace.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.idToken',
        'req.body.refreshToken',
      ],
      remove: true,
    },
  }),
);

app.get('/health', async (_req, res) => {
  try {
    await db.execute('select 1');
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

app.use('/auth', authRouter);
app.use('/matches', matchRouter);
app.use('/users', userRouter);
app.use('/', contentRouter);

app.use((_req, res) => {
  res.status(404).json({ code: 'not_found', message: 'No such endpoint.' });
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({
      code: err.code,
      message: err.message,
      ...(err.details !== undefined && !isProd ? { details: err.details } : {}),
    });
    return;
  }

  if (err instanceof ZodError) {
    // Request validation. A response-schema failure is a bug, not a 400 — those
    // surface below as a 500, which is the point (lib/respond.ts).
    res.status(400).json({
      code: 'invalid_request',
      message: 'Some of that input was not valid.',
      fields: err.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
    return;
  }

  req.log?.error({ err }, 'unhandled error');
  if (sentryOn) Sentry.captureException(err);
  res.status(500).json({
    code: 'server_error',
    message: 'Something went wrong on our side. Try again.',
  });
});

const server = app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `sabipass api listening on :${env.PORT} (${env.NODE_ENV})` +
      (sentryOn ? ' · sentry on' : ''),
  );
  startCron();
});

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
