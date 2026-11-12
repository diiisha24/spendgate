import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isProduction } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import type { ApiErrorBody } from '../types/api.js';

interface HttpLikeError {
  status?: number;
  statusCode?: number;
  type?: string;
}

/**
 * Central error handler. Express 5 forwards rejected promises from async
 * handlers here automatically, so controllers do not need try/catch.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response<ApiErrorBody>,
  // Express identifies error middleware by its 4-argument signature.
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.issues },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with these details already exists' },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
      return;
    }
    if (err.code === 'P2028' || err.code === 'P2034') {
      res.status(503).json({
        error: { code: 'BUSY', message: 'The system is busy. Please retry the operation.' },
      });
      return;
    }
  }

  // Errors raised by body-parser (malformed JSON, payload too large).
  const httpErr = err as HttpLikeError;
  const status = httpErr?.status ?? httpErr?.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({
      error: {
        code: httpErr.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message: httpErr.type === 'entity.parse.failed' ? 'Malformed JSON body' : 'Bad request',
      },
    });
    return;
  }

  console.error(`[error] ${req.method} ${req.originalUrl}`, err);

  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: isProduction ? undefined : String(err instanceof Error ? err.message : err),
    },
  });
}
