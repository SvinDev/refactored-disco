// Состояние демо. Всё лежит в localStorage этого браузера и никуда не отправляется.

import { ELECTIONS, electionStatus, getElection } from './data.js';
import { sha256Hex, randomHex, receiptFromHash } from './crypto.js';
import * as tg from './telegram.js';

const KEY = 'eg-demo.v2';

const EMPTY = {
  version: 2,
  session: null,      // { token, label, tg, issuedTokens } — привязка к демо-аккаунту Telegram
  telegram: {         // состояние симулированного бота
    account: null,    // текущий демо-аккаунт
    code: null,       // выданный одноразовый код
    log: []           // переписка с ботом
  },
  chain: [],          // публичный реестр голосов (хеш-цепочка)
  issued: {},         // electionId -> [хеши «избиратель + голосование»], получившие бюллетень
  ballots: {},        // токен избирателя -> electionId -> квитанция (только в вашем браузере)
  seeded: false
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(EMPTY), ...parsed };
  } catch {
    return structuredClone(EMPTY);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* приватный режим браузера — демо продолжит работать в памяти */
  }
}

export function getState() {
  return state;
}

export function resetAll() {
  state = structuredClone(EMPTY);
  persist();
}

/* ————— симулированный бот Telegram ————— */

function pushLog(from, text) {
  state.telegram.log.push({ from, text, ts: Date.now() });
  if (state.telegram.log.length > 12) state.telegram.log = state.telegram.log.slice(-12);
}

export function telegramAccount() {
  if (!state.telegram.account) {
    state.telegram.account = tg.createAccount();
    persist();
  }
  return state.telegram.account;
}

export function telegramState() {
  return state.telegram;
}

// «Отправка» /start боту: выдаём одноразовый код и пишем его в переписку.
export function requestCode() {
  const account = telegramAccount();
  const previous = state.telegram.code;
  const code = tg.createCode(account.id);
  state.telegram.code = code;
  pushLog('user', previous ? '/code' : '/start');
  if (previous && !previous.used) pushLog('bot', `Предыдущий код ${previous.value} аннулирован.`);
  pushLog('bot', `Ваш одноразовый код для входа: ${code.value}\nДействует 5 минут, подходит для одного входа. Никому его не передавайте.`);
  persist();
  return code;
}

// Смена демо-аккаунта: показывает, что привязка к мессенджеру защищает
// от повторного голосования одним аккаунтом, но не от набора разных аккаунтов.
export function switchAccount() {
  state.telegram = { account: tg.createAccount(), code: null, log: [] };
  state.session = null;
  persist();
  return state.telegram.account;
}

/* ————— сессия избирателя ————— */

async function buildIssuedTokens(token) {
  const map = {};
  for (const election of ELECTIONS) {
    map[election.id] = await sha256Hex(`${token}:${election.id}`);
  }
  return map;
}

// Ввод кода из бота — единственный способ войти.
export async function signInWithCode(input) {
  const account = telegramAccount();
  const result = tg.checkCode(state.telegram.code, input);
  if (!result.ok) {
    persist();  // счётчик попыток изменился
    return result;
  }

  const token = await sha256Hex(`tg:${account.id}`);
  state.session = {
    token,
    label: `@${account.username}`,
    tg: { id: account.id, username: account.username, name: account.name },
    issuedTokens: await buildIssuedTokens(token)
  };
  pushLog('bot', 'Вход подтверждён. Код погашен.');
  persist();
  return { ok: true, session: state.session };
}

export function signOut() {
  state.session = null;
  persist();
}

export function isSignedIn() {
  return Boolean(state.session);
}

/* ————— реестр ————— */

const GENESIS = '0'.repeat(64);

async function blockHash(block) {
  return sha256Hex([block.i, block.prev, block.ts, block.electionId, block.optionId, block.commitment].join('|'));
}

async function appendBlock({ electionId, optionId, commitment, ts }) {
  const prev = state.chain.length ? state.chain[state.chain.length - 1].hash : GENESIS;
  const block = { i: state.chain.length, ts, electionId, optionId, commitment, prev, hash: '' };
  block.hash = await blockHash(block);
  state.chain.push(block);
  return block;
}

// Первый запуск: наполняем реестр фоновыми голосами, чтобы результаты было видно.
export async function seedIfNeeded() {
  if (state.seeded) return;
  const now = Date.now();
  for (const election of ELECTIONS) {
    const opens = Date.parse(election.opensAt);
    const closes = Math.min(Date.parse(election.closesAt), now);
    const total = election.seedVotes;
    const weightSum = election.options.reduce((s, o) => s + o.weight, 0);
    const plan = [];
    election.options.forEach((option, idx) => {
      const share = idx === election.options.length - 1
        ? total - plan.length
        : Math.round((option.weight / weightSum) * total);
      for (let i = 0; i < share; i++) plan.push(option.id);
    });
    // перемешиваем, чтобы порядок записей в реестре не выдавал выбор
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [plan[i], plan[j]] = [plan[j], plan[i]];
    }
    const span = Math.max(closes - opens, 36e5);
    for (let i = 0; i < plan.length; i++) {
      await appendBlock({
        electionId: election.id,
        optionId: plan[i],
        commitment: randomHex(32),
        ts: Math.round(opens + (span * (i + 1)) / (plan.length + 1))
      });
    }
    state.issued[election.id] = Array.from({ length: plan.length }, () => randomHex(8));
  }
  state.seeded = true;
  persist();
}

/* ————— голосование ————— */

// Право на бюллетень определяется списком выдачи, а не памятью браузера:
// тот же аккаунт Telegram второй бюллетень не получит.
export function hasVoted(electionId) {
  const session = state.session;
  if (!session) return false;
  return (state.issued[electionId] || []).includes(session.issuedTokens[electionId]);
}

export function myBallot(electionId) {
  const session = state.session;
  if (!session) return null;
  return (state.ballots[session.token] || {})[electionId] || null;
}

export function allBallots() {
  return Object.values(state.ballots).flatMap((byElection) => Object.entries(byElection)
    .map(([electionId, ballot]) => ({ electionId, ...ballot })));
}

export function canVote(electionId) {
  const election = getElection(electionId);
  if (!election) return { ok: false, reason: 'Голосование не найдено.' };
  if (!state.session) return { ok: false, reason: 'Подтвердите личность через бота.' };
  if (electionStatus(election) !== 'active') return { ok: false, reason: 'Голосование сейчас закрыто.' };
  if (hasVoted(electionId)) return { ok: false, reason: 'Этот аккаунт уже получил бюллетень.' };
  return { ok: true };
}

export async function castVote(electionId, optionId) {
  const check = canVote(electionId);
  if (!check.ok) throw new Error(check.reason);

  const election = getElection(electionId);
  if (!election.options.some((o) => o.id === optionId)) throw new Error('Вариант не найден в бюллетене.');

  // Соль остаётся у избирателя: по ней он позже докажет, что запись в реестре — его.
  const salt = randomHex(16);
  const commitment = await sha256Hex(`${optionId}:${salt}`);
  const block = await appendBlock({ electionId, optionId, commitment, ts: Date.now() });

  // Реестр выданных бюллетеней хранится отдельно от реестра голосов:
  // он отвечает только на вопрос «голосовал ли этот избиратель», но не «за что».
  (state.issued[electionId] ||= []).push(state.session.issuedTokens[electionId]);

  const receipt = receiptFromHash(block.hash);
  const byElection = (state.ballots[state.session.token] ||= {});
  byElection[electionId] = { receipt, salt, optionId, commitment, blockHash: block.hash, ts: block.ts };
  persist();
  return { receipt, block };
}

/* ————— подсчёт и проверки ————— */

export function tally(electionId) {
  const election = getElection(electionId);
  const counts = Object.fromEntries(election.options.map((o) => [o.id, 0]));
  let total = 0;
  for (const block of state.chain) {
    if (block.electionId !== electionId) continue;
    if (block.optionId in counts) {
      counts[block.optionId]++;
      total++;
    }
  }
  const mine = myBallot(electionId);
  const rows = election.options.map((option, idx) => ({
    id: option.id,
    name: option.name,
    note: option.note,
    slot: idx + 1,
    votes: counts[option.id],
    share: total ? (counts[option.id] / total) * 100 : 0,
    isMine: Boolean(mine && mine.optionId === option.id)
  }));
  return { rows, total, turnout: election.electorate ? (total / election.electorate) * 100 : 0 };
}

export function chainFor(electionId) {
  return state.chain.filter((b) => b.electionId === electionId);
}

// Проверка целостности: каждая запись должна ссылаться на хеш предыдущей
// и её собственный хеш должен пересчитываться из содержимого.
export async function verifyChain() {
  const problems = [];
  let prev = GENESIS;
  for (const block of state.chain) {
    if (block.prev !== prev) problems.push({ i: block.i, kind: 'Нарушена связь с предыдущей записью' });
    const recomputed = await blockHash(block);
    if (recomputed !== block.hash) problems.push({ i: block.i, kind: 'Содержимое записи не соответствует её хешу' });
    prev = block.hash;
  }
  return { ok: problems.length === 0, problems, length: state.chain.length };
}

// Демонстрация: подменяем голос в случайной записи и пересчитываем её хеш,
// как поступил бы тот, кто хочет скрыть правку. Связь со следующей записью рвётся.
export async function tamperWithChain() {
  const candidates = state.chain.filter((b) => {
    const election = getElection(b.electionId);
    return election && election.options.length > 1;
  });
  if (!candidates.length) return null;
  const block = candidates[Math.floor(Math.random() * candidates.length)];
  const election = getElection(block.electionId);
  const other = election.options.find((o) => o.id !== block.optionId);
  block.optionId = other.id;
  block.hash = await blockHash(block);
  persist();
  return block;
}

export async function repairChain() {
  let prev = GENESIS;
  for (const block of state.chain) {
    block.prev = prev;
    block.hash = await blockHash(block);
    prev = block.hash;
  }
  // квитанции избирателей привязаны к записи по commitment — обновляем их
  for (const byElection of Object.values(state.ballots)) {
    for (const ballot of Object.values(byElection)) {
      const block = state.chain.find((b) => b.commitment === ballot.commitment);
      if (block) {
        ballot.blockHash = block.hash;
        ballot.receipt = receiptFromHash(block.hash);
      }
    }
  }
  persist();
}

// Поиск записи по квитанции + подтверждение авторства через соль избирателя.
export async function lookupReceipt(normalized) {
  const block = state.chain.find((b) => b.hash.slice(0, 16).toUpperCase() === normalized);
  if (!block) return { found: false };

  const ballot = allBallots().find((m) => m.blockHash === block.hash);
  let proven = false;
  if (ballot) {
    const expected = await sha256Hex(`${ballot.optionId}:${ballot.salt}`);
    proven = expected === block.commitment;
  }
  return { found: true, block, ballot: ballot || null, proven };
}

export function exportChain() {
  return JSON.stringify({ exportedAt: new Date().toISOString(), chain: state.chain }, null, 2);
}
