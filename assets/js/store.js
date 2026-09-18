// Состояние демо. Всё лежит в localStorage этого браузера и никуда не отправляется.

import { ELECTIONS, electionStatus, getElection } from './data.js';
import { sha256Hex, randomHex, receiptFromHash } from './crypto.js';

const KEY = 'eg-demo.v1';

const EMPTY = {
  version: 1,
  session: null,      // { token, label } — анонимный токен избирателя
  chain: [],          // публичный реестр голосов (хеш-цепочка)
  issued: {},         // electionId -> [хеши токенов, получивших бюллетень]
  mine: {},           // electionId -> { receipt, salt, optionId, blockHash, ts } — только в вашем браузере
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

/* ————— сессия избирателя ————— */

export async function signIn(rawId) {
  const id = String(rawId || '').trim();
  if (id.length < 3) throw new Error('Введите демо-идентификатор длиной не меньше 3 символов.');
  const token = await sha256Hex(`voter:${id.toLowerCase()}`);
  state.session = { token, label: `Избиратель ${token.slice(0, 6).toUpperCase()}` };
  persist();
  return state.session;
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

export function hasVoted(electionId) {
  return Boolean(state.mine[electionId]);
}

export function myBallot(electionId) {
  return state.mine[electionId] || null;
}

export function canVote(electionId) {
  const election = getElection(electionId);
  if (!election) return { ok: false, reason: 'Голосование не найдено.' };
  if (!state.session) return { ok: false, reason: 'Войдите в демо-кабинет.' };
  if (electionStatus(election) !== 'active') return { ok: false, reason: 'Голосование сейчас закрыто.' };
  if (hasVoted(electionId)) return { ok: false, reason: 'Бюллетень уже подан.' };
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
  const issuedToken = await sha256Hex(`${state.session.token}:${electionId}`);
  (state.issued[electionId] ||= []).push(issuedToken);

  const receipt = receiptFromHash(block.hash);
  state.mine[electionId] = { receipt, salt, optionId, commitment, blockHash: block.hash, ts: block.ts };
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
  // квитанции избирателя привязаны к записи по commitment — обновляем их
  for (const ballot of Object.values(state.mine)) {
    const block = state.chain.find((b) => b.commitment === ballot.commitment);
    if (block) {
      ballot.blockHash = block.hash;
      ballot.receipt = receiptFromHash(block.hash);
    }
  }
  persist();
}

// Поиск записи по квитанции + подтверждение авторства через соль избирателя.
export async function lookupReceipt(normalized) {
  const block = state.chain.find((b) => b.hash.slice(0, 16).toUpperCase() === normalized);
  if (!block) return { found: false };

  const ballot = Object.values(state.mine).find((m) => m.blockHash === block.hash);
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
