// Хеширование для квитанций и хеш-цепочки реестра.
// Основной путь — SHA-256 через Web Crypto (доступен в https-контексте).

const encoder = new TextEncoder();

export const hasWebCrypto = typeof crypto !== 'undefined'
  && typeof crypto.subtle !== 'undefined'
  && typeof crypto.subtle.digest === 'function';

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Запасной вариант на случай небезопасного контекста (например, открытие файла с диска).
// Пригоден только для демонстрации: это не криптографический хеш.
function fallbackHash(text) {
  let out = '';
  for (let lane = 0; lane < 8; lane++) {
    let h = 0x811c9dc5 ^ (lane * 0x9e3779b9);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i) + lane;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

export async function sha256Hex(text) {
  if (!hasWebCrypto) return fallbackHash(text);
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return toHex(digest);
}

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Квитанция — первые 16 символов хеша записи, разбитые по 4 для чтения вслух.
export function receiptFromHash(hash) {
  return hash.slice(0, 16).toUpperCase().replace(/(.{4})(?=.)/g, '$1-');
}

export function normalizeReceipt(input) {
  return String(input || '').toUpperCase().replace(/[^0-9A-F]/g, '');
}

export function shortHash(hash, size = 10) {
  return hash ? `${hash.slice(0, size)}…` : '—';
}
