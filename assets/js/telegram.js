// Симуляция Telegram-бота проверки избирателя.
// Настоящего бота не существует: ни токена, ни сети, ни обращений к api.telegram.org.
// Модуль воспроизводит только логику одноразовых кодов, чтобы её можно было потрогать.

import { randomHex } from './crypto.js';

export const BOT_HANDLE = 'eg_demo_verify_bot';
export const CODE_TTL_MS = 5 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

const NAMES = ['Алексей', 'Марина', 'Тимур', 'Ольга', 'Дамир', 'Светлана', 'Игорь', 'Полина'];

export function createAccount() {
  const suffix = randomHex(3);
  return {
    id: 100000000 + Math.floor(Math.random() * 899999999),
    username: `demo_${suffix}`,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    createdAt: Date.now()
  };
}

export function createCode(accountId, now = Date.now()) {
  return {
    value: String(Math.floor(Math.random() * 1e6)).padStart(6, '0'),
    accountId,
    issuedAt: now,
    expiresAt: now + CODE_TTL_MS,
    attempts: 0,
    used: false
  };
}

export function codeState(code, now = Date.now()) {
  if (!code) return 'none';
  if (code.used) return 'used';
  if (now > code.expiresAt) return 'expired';
  if (code.attempts >= MAX_ATTEMPTS) return 'blocked';
  return 'valid';
}

// Проверка введённого кода. Возвращает причину отказа — как ответил бы сервер.
export function checkCode(code, input, now = Date.now()) {
  const state = codeState(code, now);
  if (state === 'none') return { ok: false, reason: 'Сначала запросите код у бота.' };
  if (state === 'used') return { ok: false, reason: 'Этот код уже использован. Запросите новый.' };
  if (state === 'expired') return { ok: false, reason: 'Срок действия кода истёк. Запросите новый.' };
  if (state === 'blocked') return { ok: false, reason: 'Исчерпаны попытки ввода. Запросите новый код.' };

  const cleaned = String(input || '').replace(/\D/g, '');
  if (cleaned !== code.value) {
    code.attempts += 1;
    const left = MAX_ATTEMPTS - code.attempts;
    return {
      ok: false,
      reason: left > 0
        ? `Код неверен. Осталось попыток: ${left}.`
        : 'Код неверен, попытки исчерпаны. Запросите новый код.'
    };
  }

  code.used = true;
  return { ok: true };
}

export function msLeft(code, now = Date.now()) {
  return code ? Math.max(0, code.expiresAt - now) : 0;
}

export function formatCountdown(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
