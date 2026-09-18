// Точка входа: маршрутизация по хешу, тема, служебные помощники.

import * as store from './store.js';
import * as views from './views.js';

const ROUTES = [
  [/^\/?$/,                       views.home],
  [/^\/vhod$/,                    views.signIn],
  [/^\/kabinet$/,                 views.cabinet],
  [/^\/golosovanie\/([\w-]+)$/,   views.ballot],
  [/^\/kvitanciya\/([\w-]+)$/,    views.receipt],
  [/^\/proverka$/,                views.verify],
  [/^\/rezultaty(?:\/([\w-]+))?$/, views.results],
  [/^\/reestr$/,                  views.registry],
  [/^\/kak-eto-rabotaet$/,        views.about]
];

const root = document.getElementById('view');
const toastEl = document.getElementById('toast');

let toastTimer = null;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3600);
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ctx = { toast, download, render };

function currentPath() {
  return decodeURIComponent(location.hash.replace(/^#/, '')) || '/';
}

function markActiveNav(path) {
  document.querySelectorAll('.site-nav a').forEach((link) => {
    const target = link.getAttribute('href').replace(/^#/, '');
    const active = target !== '/' && path.startsWith(target);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

let activeUnmount = null;

function render() {
  const path = currentPath();
  let view = null;

  for (const [pattern, handler] of ROUTES) {
    const match = path.match(pattern);
    if (match) {
      view = handler({ id: match[1] });
      break;
    }
  }
  if (!view) view = views.notFound();

  if (view.redirect) {
    location.hash = view.redirect;
    return;
  }

  if (activeUnmount) {
    activeUnmount();
    activeUnmount = null;
  }

  document.title = view.title;
  root.innerHTML = view.html;
  markActiveNav(path);
  if (view.mount) view.mount(root, ctx);
  activeUnmount = view.unmount || null;

  document.querySelector('.site-nav')?.classList.remove('open');
  document.querySelector('.nav-toggle')?.setAttribute('aria-expanded', 'false');
}

/* ————— тема ————— */

const THEME_KEY = 'eg-demo.theme';

function effectiveTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* приватный режим */ }
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);
  else document.documentElement.removeAttribute('data-theme');

  document.querySelector('.theme-toggle').addEventListener('click', () => {
    applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
  });
}

/* ————— запуск ————— */

function initNav() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.site-nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

async function start() {
  initTheme();
  initNav();
  root.innerHTML = '<p class="muted">Загружаем реестр…</p>';
  try {
    await store.seedIfNeeded();
  } catch (err) {
    console.error('Не удалось подготовить демо-реестр', err);
  }
  window.addEventListener('hashchange', render);
  render();
}

start();
