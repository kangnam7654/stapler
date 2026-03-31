import { t } from "./i18n/index.js";

export class HttpError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new HttpError(400, message, details);
}

export function unauthorized(message = t("error.unauthorized")) {
  return new HttpError(401, message);
}

export function forbidden(message = t("error.forbidden")) {
  return new HttpError(403, message);
}

export function notFound(message = t("error.notFound")) {
  return new HttpError(404, message);
}

export function conflict(message: string, details?: unknown) {
  return new HttpError(409, message, details);
}

export function unprocessable(message: string, details?: unknown) {
  return new HttpError(422, message, details);
}
