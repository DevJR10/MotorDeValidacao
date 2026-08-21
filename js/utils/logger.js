// utils/logger.js
// Logger simples e consistente. Centraliza o formato para facilitar debug
// tanto no thread principal quanto dentro do Web Worker.

const PREFIX = '[Validador]';

export const logger = {
  debug: (...args) => console.debug(PREFIX, ...args),
  info: (...args) => console.info(PREFIX, ...args),
  warn: (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
};
