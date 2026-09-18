// Экраны приложения. Каждый возвращает { title, html, mount? }.

import { ELECTIONS, getElection, electionStatus, STATUS_LABEL, formatDate, plural } from './data.js';
import { hasWebCrypto, normalizeReceipt, shortHash } from './crypto.js';
import * as tg from './telegram.js';
import * as store from './store.js';

export const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const statusBadge = (status) => `<span class="badge is-${status}">${STATUS_LABEL[status]}</span>`;

function electionCard(election) {
  const status = electionStatus(election);
  const voted = store.hasVoted(election.id);
  const closes = status === 'done' ? 'завершилось' : 'до';
  return `
    <article class="card vote-card">
      <div class="top">
        ${statusBadge(status)}
        ${voted ? '<span class="badge is-voted">Вы проголосовали</span>' : ''}
      </div>
      <h3>${esc(election.title)}</h3>
      <p class="muted" style="margin:0">${esc(election.org)}</p>
      <p class="tiny" style="margin:0">${closes} ${esc(formatDate(election.closesAt))} · ${plural(election.electorate, 'избиратель', 'избирателя', 'избирателей')} в списке</p>
      <div class="btn-row" style="margin-top:6px">
        ${status === 'active' && !voted
          ? `<a class="btn" href="#/golosovanie/${election.id}">Взять бюллетень</a>`
          : ''}
        ${status === 'active' && voted ? '<span class="tiny">Этот аккаунт бюллетень уже получил</span>' : ''}
        ${voted ? `<a class="btn secondary" href="#/kvitanciya/${election.id}">Моя квитанция</a>` : ''}
        <a class="btn ghost" href="#/rezultaty/${election.id}">Результаты</a>
      </div>
    </article>`;
}

/* ————— главная ————— */

export function home() {
  const html = `
    <section class="hero">
      <h1>Проверяемое электронное голосование — как это может работать</h1>
      <p class="lead">Рабочий прототип: получите бюллетень, проголосуйте, сохраните квитанцию и убедитесь, что ваш голос лежит в публичном реестре именно таким, каким вы его подали.</p>
      <div class="btn-row" style="margin-bottom:26px">
        <a class="btn" href="#/kabinet">Открыть демо-кабинет</a>
        <a class="btn secondary" href="#/kak-eto-rabotaet">Как это устроено</a>
      </div>
    </section>

    <div class="notice warn" style="margin-bottom:22px">
      <p>Это учебная модель, а не действующая система. Она не связана с государственными органами и избирательными комиссиями, не собирает персональные данные и не передаёт ничего на сервер: весь «реестр» живёт в памяти вашего браузера. Не вводите здесь настоящие документы, СНИЛС и пароли.</p>
    </div>

    <div class="grid cols-3">
      <article class="card feature">
        <h3><span class="ico" aria-hidden="true">1</span>Проверка избирателя</h3>
        <p class="muted">Вход по одноразовому коду из бота: один аккаунт — один бюллетень. Список получивших бюллетень хранится отдельно от реестра голосов, связи между ними нет.</p>
      </article>
      <article class="card feature">
        <h3><span class="ico" aria-hidden="true">2</span>Квитанция избирателя</h3>
        <p class="muted">После подачи бюллетеня вы получаете код записи в реестре. По нему голос можно найти, но нельзя доказать постороннему, за что он подан.</p>
      </article>
      <article class="card feature">
        <h3><span class="ico" aria-hidden="true">3</span>Реестр, который нельзя тихо поправить</h3>
        <p class="muted">Записи связаны в хеш-цепочку: правка любой из них рвёт связь со следующей. Проверить целостность реестра может кто угодно — прямо на странице реестра.</p>
      </article>
    </div>

    <h2 style="margin-top:34px">Открытые голосования</h2>
    <div class="grid cols-2">
      ${ELECTIONS.filter((e) => electionStatus(e) === 'active').map(electionCard).join('')}
    </div>`;
  return { title: 'ЭГ-Демо — прототип электронного голосования', html };
}

/* ————— вход через симулированного бота Telegram ————— */

const TIME_FMT = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });

function chatMessage(message) {
  const text = esc(message.text).replace(/\n/g, '<br>');
  return `<div class="tg-msg is-${message.from}"><span>${text}</span><time>${TIME_FMT.format(new Date(message.ts))}</time></div>`;
}

export function signIn() {
  if (store.isSignedIn()) return { redirect: '#/kabinet' };

  const account = store.telegramAccount();
  const telegram = store.telegramState();
  const code = telegram.code;
  const state = tg.codeState(code);

  const html = `
    <div class="page-head">
      <h1>Подтверждение избирателя</h1>
      <p class="muted">Бюллетень выдаётся по одноразовому коду из бота. Один аккаунт Telegram — один бюллетень: повторно взять его не получится.</p>
    </div>

    <div class="notice warn" style="margin-bottom:18px">
      <p><strong>Бот симулирован.</strong> Аккаунта <span class="mono">@${esc(tg.BOT_HANDLE)}</span> не существует, сеть не используется, токен бота нигде не хранится. Переписка ниже разыгрывается прямо в браузере — на статическом сайте настоящая проверка кода невозможна, её должен выполнять сервер.</p>
    </div>

    <div class="grid cols-2">
      <div class="card tg-card">
        <div class="tg-head">
          <span class="tg-avatar" aria-hidden="true">tg</span>
          <span class="tg-title">
            <b>@${esc(tg.BOT_HANDLE)}</b>
            <small>симуляция чата</small>
          </span>
        </div>
        <p class="tiny">Вы пишете боту как <strong>@${esc(account.username)}</strong> · id ${account.id}</p>

        <div class="tg-chat" id="tg-chat">
          ${telegram.log.length
            ? telegram.log.map(chatMessage).join('')
            : '<p class="tiny" style="text-align:center;margin:auto">Отправьте боту <span class="mono">/start</span>, чтобы получить код</p>'}
        </div>

        <div class="btn-row">
          <button class="btn" type="button" id="send-start">${telegram.log.length ? 'Запросить новый код' : 'Отправить /start'}</button>
        </div>
      </div>

      <form class="card" id="code-form" novalidate>
        <h2 style="font-size:1.15rem">Код из бота</h2>
        <label class="field" for="code-input">Шесть цифр
          <span class="hint">Код одноразовый и действует пять минут.</span>
          <input type="text" id="code-input" name="code" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="7" spellcheck="false" placeholder="000000" ${state === 'valid' ? '' : 'disabled'}>
        </label>
        <p class="tiny" id="code-status" aria-live="polite"></p>
        <p class="tiny" id="code-error" role="alert"></p>
        <button class="btn" type="submit" id="code-submit" ${state === 'valid' ? '' : 'disabled'}>Подтвердить и войти</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <h2 style="font-size:1.15rem">Что даёт такая проверка — и чего не даёт</h2>
      <div class="grid cols-2">
        <div>
          <h3 style="font-size:.98rem">Защищает от</h3>
          <ul class="muted" style="padding-left:20px;margin:0">
            <li>повторного голосования одним и тем же аккаунтом;</li>
            <li>входа по подсмотренному коду: код одноразовый, живёт 5 минут и гасится после первого входа;</li>
            <li>перебора: после ${tg.MAX_ATTEMPTS} неверных попыток код аннулируется.</li>
          </ul>
        </div>
        <div>
          <h3 style="font-size:.98rem">Не защищает от</h3>
          <ul class="muted" style="padding-left:20px;margin:0">
            <li>накрутки с разных аккаунтов: их покупают пачками вместе с номерами;</li>
            <li>передачи кода другому человеку — проверяется владение аккаунтом, а не личность;</li>
            <li>доступа к самому мессенджеру: кто читает чужие сообщения, тот получит и код.</li>
          </ul>
        </div>
      </div>
      <p class="tiny" style="margin-top:14px">Привязка к мессенджеру даёт «один голос на аккаунт», а не «один голос на избирателя». Проверьте сами: возьмите другой аккаунт и попробуйте проголосовать второй раз.</p>
      <div class="btn-row"><button class="btn secondary" type="button" id="switch-account">Взять другой аккаунт</button></div>
    </div>`;

  let timer = null;

  function mount(root, ctx) {
    const form = root.querySelector('#code-form');
    const input = root.querySelector('#code-input');
    const error = root.querySelector('#code-error');
    const status = root.querySelector('#code-status');
    const submit = root.querySelector('#code-submit');
    const chat = root.querySelector('#tg-chat');
    chat.scrollTop = chat.scrollHeight;

    function refreshStatus() {
      const current = store.telegramState().code;
      const now = Date.now();
      const currentState = tg.codeState(current, now);
      if (currentState === 'none') {
        status.textContent = 'Код ещё не запрошен.';
        return;
      }
      if (currentState !== 'valid') {
        status.textContent = currentState === 'expired'
          ? 'Срок действия кода истёк — запросите новый.'
          : 'Код больше не действует — запросите новый.';
        input.disabled = true;
        submit.disabled = true;
        clearInterval(timer);
        return;
      }
      status.textContent = `Код действует ещё ${tg.formatCountdown(tg.msLeft(current, now))} · попыток осталось: ${tg.MAX_ATTEMPTS - current.attempts}`;
    }

    refreshStatus();
    timer = setInterval(refreshStatus, 1000);

    root.querySelector('#send-start').addEventListener('click', () => {
      store.requestCode();
      ctx.render();
    });

    root.querySelector('#switch-account').addEventListener('click', () => {
      const next = store.switchAccount();
      ctx.toast(`Теперь вы пишете боту как @${next.username}`);
      ctx.render();
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';
      const result = await store.signInWithCode(input.value);
      if (result.ok) {
        ctx.toast('Личность подтверждена');
        location.hash = '#/kabinet';
        return;
      }
      error.textContent = result.reason;
      input.select();
      refreshStatus();
    });
  }

  function unmount() {
    clearInterval(timer);
  }

  return { title: 'Подтверждение избирателя — ЭГ-Демо', html, mount, unmount };
}

/* ————— кабинет ————— */

export function cabinet() {
  if (!store.isSignedIn()) return { redirect: '#/vhod' };
  const { session } = store.getState();
  const active = ELECTIONS.filter((e) => electionStatus(e) === 'active');
  const other = ELECTIONS.filter((e) => electionStatus(e) !== 'active');
  const votedCount = active.filter((e) => store.hasVoted(e.id)).length;

  const html = `
    <div class="page-head">
      <h1>Демо-кабинет</h1>
      <p class="muted">Личность подтверждена через бота: <strong>${esc(session.label)}</strong> · id ${session.tg.id}. Доступно ${plural(active.length, 'голосование', 'голосования', 'голосований')}, бюллетеней подано: ${votedCount}.</p>
      <div class="btn-row">
        <button class="btn secondary" type="button" id="signout">Выйти</button>
        <a class="btn ghost" href="#/proverka">Проверить свой голос</a>
      </div>
    </div>

    <h2>Доступные голосования</h2>
    <div class="grid cols-2">${active.map(electionCard).join('') || '<p class="muted">Сейчас активных голосований нет.</p>'}</div>

    <h2 style="margin-top:30px">Архив и будущие голосования</h2>
    <div class="grid cols-2">${other.map(electionCard).join('')}</div>`;

  function mount(root) {
    root.querySelector('#signout').addEventListener('click', () => {
      store.signOut();
      location.hash = '#/';
    });
  }

  return { title: 'Кабинет — ЭГ-Демо', html, mount };
}

/* ————— бюллетень ————— */

export function ballot(params) {
  const election = getElection(params.id);
  if (!election) return { redirect: '#/kabinet' };
  if (!store.isSignedIn()) return { redirect: '#/vhod' };
  if (store.hasVoted(election.id)) return { redirect: `#/kvitanciya/${election.id}` };

  const status = electionStatus(election);
  if (status !== 'active') {
    return {
      title: `${election.title} — ЭГ-Демо`,
      html: `<div class="card"><h1>${esc(election.title)}</h1><p class="muted">${STATUS_LABEL[status]}. Подать бюллетень нельзя.</p>
        <a class="btn secondary" href="#/rezultaty/${election.id}">Посмотреть результаты</a></div>`
    };
  }

  const html = `
    <p class="crumb"><a href="#/kabinet">← Кабинет</a></p>
    <div class="page-head">
      ${statusBadge(status)}
      <h1>${esc(election.title)}</h1>
      <p class="muted">${esc(election.org)} · приём бюллетеней до ${esc(formatDate(election.closesAt))}</p>
    </div>

    <form class="card" id="ballot-form">
      <h2 style="font-size:1.15rem">${esc(election.question)}</h2>
      <p class="tiny">Выберите один вариант. Изменить поданный бюллетень будет нельзя.</p>
      <ul class="ballot">
        ${election.options.map((option) => `
          <li>
            <label>
              <input type="radio" name="choice" value="${esc(option.id)}">
              <span>
                <span class="name">${esc(option.name)}</span>
                ${option.note ? `<span class="note">${esc(option.note)}</span>` : ''}
              </span>
            </label>
          </li>`).join('')}
      </ul>
      <p class="tiny" id="ballot-error" role="alert"></p>
      <div class="btn-row">
        <button class="btn" type="submit" id="cast">Подать бюллетень</button>
        <a class="btn ghost" href="#/kabinet">Отмена</a>
      </div>
    </form>

    <div class="notice" style="margin-top:16px">
      <p>При подаче бюллетеня браузер сгенерирует случайную соль, посчитает <span class="mono">SHA-256(вариант + соль)</span> и запишет в реестр только это значение вместе с выбранным вариантом — без вашего токена. Соль останется у вас: по ней вы позже докажете, что запись ваша.</p>
    </div>`;

  function mount(root, ctx) {
    const form = root.querySelector('#ballot-form');
    const error = root.querySelector('#ballot-error');
    const button = root.querySelector('#cast');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.textContent = '';
      const choice = form.elements.choice.value;
      if (!choice) {
        error.textContent = 'Выберите один из вариантов.';
        return;
      }
      const option = election.options.find((o) => o.id === choice);
      if (!confirm(`Подать бюллетень с выбором «${option.name}»?\n\nПосле подтверждения изменить голос будет нельзя.`)) return;

      button.disabled = true;
      try {
        await store.castVote(election.id, choice);
        ctx.toast('Бюллетень подан. Сохраните квитанцию.');
        location.hash = `#/kvitanciya/${election.id}`;
      } catch (err) {
        error.textContent = err.message;
        button.disabled = false;
      }
    });
  }

  return { title: `${election.title} — ЭГ-Демо`, html, mount };
}

/* ————— квитанция ————— */

export function receipt(params) {
  const election = getElection(params.id);
  const ballotData = election && store.myBallot(election.id);
  if (!election || !ballotData) return { redirect: '#/kabinet' };
  const option = election.options.find((o) => o.id === ballotData.optionId);

  const html = `
    <p class="crumb"><a href="#/kabinet">← Кабинет</a></p>
    <div class="page-head">
      <h1>Бюллетень принят</h1>
      <p class="muted">${esc(election.title)}</p>
    </div>

    <div class="card">
      <p class="tiny" style="text-align:center;margin-bottom:8px">Номер вашей записи в реестре</p>
      <p class="receipt" id="receipt-code">${esc(ballotData.receipt)}</p>
      <div class="btn-row" style="justify-content:center;margin:16px 0 6px">
        <button class="btn secondary" type="button" id="copy">Скопировать</button>
        <button class="btn secondary" type="button" id="download">Скачать квитанцию</button>
        <a class="btn ghost" href="#/proverka">Проверить голос</a>
      </div>
    </div>

    <div class="card">
      <h2 style="font-size:1.15rem">Что записано</h2>
      <dl class="kv">
        <dt>Голосование</dt><dd>${esc(election.title)}</dd>
        <dt>Время подачи</dt><dd>${esc(formatDate(ballotData.ts))}</dd>
        <dt>Ваш выбор</dt><dd>${esc(option ? option.name : '—')}</dd>
        <dt>Подтверждение</dt><dd class="mono tiny">${esc(shortHash(ballotData.commitment, 24))}</dd>
        <dt>Хеш записи</dt><dd class="mono tiny">${esc(ballotData.blockHash)}</dd>
      </dl>
      <div class="notice warn" style="margin-top:16px">
        <p>Выбор и соль показаны только вам и хранятся исключительно в этом браузере. В публичном реестре нет ни вашего токена, ни соли — по записи нельзя установить, кто её подал. Очистка данных сайта уничтожит соль, и доказать авторство записи станет невозможно.</p>
      </div>
    </div>`;

  function mount(root, ctx) {
    root.querySelector('#copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ballotData.receipt);
        ctx.toast('Квитанция скопирована');
      } catch {
        ctx.toast('Скопируйте код вручную');
      }
    });
    root.querySelector('#download').addEventListener('click', () => {
      const text = [
        'ЭГ-Демо — квитанция избирателя (демонстрационный прототип, юридической силы не имеет)',
        `Голосование: ${election.title}`,
        `Время подачи: ${formatDate(ballotData.ts)}`,
        `Квитанция: ${ballotData.receipt}`,
        `Хеш записи: ${ballotData.blockHash}`,
        `Соль (хранить в тайне): ${ballotData.salt}`
      ].join('\n');
      ctx.download(`kvitanciya-${election.id}.txt`, text, 'text/plain;charset=utf-8');
    });
  }

  return { title: `Квитанция — ЭГ-Демо`, html, mount };
}

/* ————— проверка голоса ————— */

export function verify() {
  const mine = store.allBallots();
  const html = `
    <div class="page-head">
      <h1>Проверка голоса</h1>
      <p class="muted">Введите номер квитанции — система найдёт запись в реестре и, если в этом браузере сохранена ваша соль, подтвердит, что запись именно ваша и содержит выбранный вами вариант.</p>
    </div>

    <form class="card" id="verify-form">
      <label class="field" for="receipt-input">Номер квитанции
        <span class="hint">Например, <span class="mono">A1B2-C3D4-E5F6-7890</span>. Разделители можно не вводить.</span>
        <input type="text" id="receipt-input" name="receipt" autocomplete="off" spellcheck="false" placeholder="A1B2-C3D4-E5F6-7890">
      </label>
      <div class="btn-row">
        <button class="btn" type="submit">Найти запись</button>
        ${mine.length ? '<button class="btn secondary" type="button" id="fill-mine">Подставить мою квитанцию</button>' : ''}
      </div>
    </form>

    <div id="verify-result" style="margin-top:16px"></div>`;

  function mount(root) {
    const form = root.querySelector('#verify-form');
    const input = root.querySelector('#receipt-input');
    const result = root.querySelector('#verify-result');
    const fill = root.querySelector('#fill-mine');

    if (fill) {
      fill.addEventListener('click', () => {
        input.value = mine[0].receipt;
        input.focus();
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const normalized = normalizeReceipt(input.value);
      if (normalized.length < 16) {
        result.innerHTML = '<div class="notice bad"><p>Номер квитанции состоит из 16 символов (цифры и латинские буквы A–F). Проверьте ввод.</p></div>';
        return;
      }
      const found = await store.lookupReceipt(normalized.slice(0, 16));
      if (!found.found) {
        result.innerHTML = `<div class="notice bad"><p><strong>Запись не найдена.</strong> В реестре этого браузера нет голоса с такой квитанцией. Если вы голосовали в другом браузере или очищали данные сайта, запись сюда не попала — это ограничение демонстрации, а не отказ системы.</p></div>`;
        return;
      }

      const election = getElection(found.block.electionId);
      const option = election.options.find((o) => o.id === found.block.optionId);
      const proofBlock = found.proven
        ? `<div class="notice ok"><p><strong>Авторство подтверждено.</strong> Соль из этого браузера вместе с вариантом «${esc(option.name)}» даёт ровно то подтверждение, которое записано в реестре. Ваш голос учтён без искажений.</p></div>`
        : `<div class="notice"><p>Запись в реестре есть, но подтвердить авторство нечем: соль этой квитанции в данном браузере не сохранена. Посторонний видит запись ровно так же — и не может узнать, кто её подал.</p></div>`;

      result.innerHTML = `
        <div class="card">
          <h2 style="font-size:1.15rem">Запись найдена в реестре</h2>
          <dl class="kv">
            <dt>Голосование</dt><dd>${esc(election.title)}</dd>
            <dt>Номер записи</dt><dd>#${found.block.i}</dd>
            <dt>Время</dt><dd>${esc(formatDate(found.block.ts))}</dd>
            <dt>Учтённый вариант</dt><dd>${esc(option ? option.name : '—')}</dd>
            <dt>Хеш записи</dt><dd class="mono tiny">${esc(found.block.hash)}</dd>
          </dl>
        </div>
        ${proofBlock}`;
    });
  }

  return { title: 'Проверка голоса — ЭГ-Демо', html, mount };
}

/* ————— результаты ————— */

export function results(params) {
  const election = params.id ? getElection(params.id) : ELECTIONS[0];
  if (!election) return { redirect: '#/kabinet' };
  const status = electionStatus(election);
  const { rows, total, turnout } = store.tally(election.id);
  const leader = rows.reduce((best, row) => (row.votes > best.votes ? row : best), rows[0]);

  const picker = ELECTIONS.map((e) => `<option value="${e.id}"${e.id === election.id ? ' selected' : ''}>${esc(e.title)}</option>`).join('');

  const html = `
    <div class="page-head">
      <h1>Результаты</h1>
      <label class="field" for="election-picker" style="max-width:520px">Голосование
        <select id="election-picker">${picker}</select>
      </label>
      <div class="btn-row">${statusBadge(status)}<span class="tiny">${status === 'done' ? 'Итоги подведены' : 'Промежуточные данные, подсчёт обновляется по мере поступления бюллетеней'}</span></div>
    </div>

    <div class="card">
      <div class="turnout">
        <div class="stat"><div class="k">Учтено бюллетеней</div><div class="v">${total.toLocaleString('ru-RU')}</div></div>
        <div class="stat"><div class="k">Явка</div><div class="v">${turnout.toFixed(1).replace('.', ',')}%</div></div>
        <div class="stat"><div class="k">В списке избирателей</div><div class="v">${election.electorate.toLocaleString('ru-RU')}</div></div>
      </div>
      <p class="tiny">${esc(election.question)}</p>

      <ul class="results" id="results-list">
        ${rows.map((row) => `
          <li class="result-row${row.isMine ? ' is-mine' : ''}" data-slot="${row.slot}">
            <div class="label">
              <span class="name">${esc(row.name)}</span>
              <span class="val">${row.votes.toLocaleString('ru-RU')} · ${row.share.toFixed(1).replace('.', ',')}%</span>
            </div>
            <div class="meter" role="img" aria-label="${esc(row.name)}: ${row.votes} ${plural(row.votes, 'голос', 'голоса', 'голосов')}, ${row.share.toFixed(1)} процента">
              <div class="fill" style="width:${row.share.toFixed(2)}%"></div>
            </div>
          </li>`).join('')}
      </ul>

      <p class="tiny" style="margin-top:18px">${total ? `Лидирует: <strong>${esc(leader.name)}</strong>.` : 'Бюллетеней пока нет.'} Подсчёт выполняется прямо из записей реестра — те же цифры может получить любой, скачав его на <a href="#/reestr">странице реестра</a>.</p>

      <details class="table-view">
        <summary>Показать таблицей</summary>
        <div class="table-wrap" style="margin-top:12px">
          <table>
            <caption class="tiny" style="text-align:left;padding-bottom:8px">${esc(election.title)} — распределение голосов</caption>
            <thead><tr><th scope="col">Вариант</th><th scope="col" class="num">Голосов</th><th scope="col" class="num">Доля</th></tr></thead>
            <tbody>
              ${rows.map((row) => `<tr><th scope="row" style="font-weight:400">${esc(row.name)}</th><td class="num">${row.votes.toLocaleString('ru-RU')}</td><td class="num">${row.share.toFixed(1).replace('.', ',')}%</td></tr>`).join('')}
            </tbody>
            <tfoot><tr><th scope="row">Всего</th><td class="num">${total.toLocaleString('ru-RU')}</td><td class="num">100,0%</td></tr></tfoot>
          </table>
        </div>
      </details>
    </div>`;

  function mount(root) {
    root.querySelector('#election-picker').addEventListener('change', (event) => {
      location.hash = `#/rezultaty/${event.target.value}`;
    });
  }

  return { title: `Результаты: ${election.title} — ЭГ-Демо`, html, mount };
}

/* ————— реестр ————— */

export function registry() {
  const { chain } = store.getState();
  const recent = chain.slice(-40).reverse();

  const html = `
    <div class="page-head">
      <h1>Публичный реестр</h1>
      <p class="muted">Каждый поданный бюллетень — запись, ссылающаяся на хеш предыдущей. Изменить запись задним числом, не сломав все последующие, нельзя: это и проверяет кнопка ниже.</p>
    </div>

    <div class="card">
      <div class="turnout">
        <div class="stat"><div class="k">Записей в реестре</div><div class="v">${chain.length.toLocaleString('ru-RU')}</div></div>
        <div class="stat"><div class="k">Последний хеш</div><div class="v mono" style="font-size:1rem;word-break:break-all">${esc(shortHash(chain.length ? chain[chain.length - 1].hash : '', 16))}</div></div>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn" type="button" id="check">Проверить целостность</button>
        <button class="btn secondary" type="button" id="export">Скачать реестр (JSON)</button>
        <button class="btn ghost" type="button" id="tamper">Подделать запись</button>
        <button class="btn ghost" type="button" id="repair" hidden>Пересобрать цепочку</button>
      </div>
      <div id="check-result" style="margin-top:14px"></div>
    </div>

    <div class="card">
      <h2 style="font-size:1.15rem">Последние записи</h2>
      <p class="tiny">Показаны 40 последних из ${plural(chain.length, 'записи', 'записей', 'записей')}. Идентификатора избирателя в записях нет.</p>
      <div class="table-wrap">
        <table>
          <thead><tr><th scope="col" class="num">№</th><th scope="col">Время</th><th scope="col">Голосование</th><th scope="col">Вариант</th><th scope="col">Хеш записи</th></tr></thead>
          <tbody>
            ${recent.map((block) => {
              const election = getElection(block.electionId);
              const option = election && election.options.find((o) => o.id === block.optionId);
              return `<tr>
                <td class="num">${block.i}</td>
                <td>${esc(formatDate(block.ts))}</td>
                <td>${esc(election ? election.title : block.electionId)}</td>
                <td>${esc(option ? option.name : block.optionId)}</td>
                <td class="hash">${esc(shortHash(block.hash, 18))}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  function mount(root, ctx) {
    const output = root.querySelector('#check-result');
    const repairBtn = root.querySelector('#repair');

    root.querySelector('#check').addEventListener('click', async () => {
      output.innerHTML = '<p class="tiny">Пересчитываем хеши…</p>';
      const report = await store.verifyChain();
      if (report.ok) {
        output.innerHTML = `<div class="notice ok"><p><strong>Цепочка цела.</strong> Пересчитаны все ${plural(report.length, 'запись', 'записи', 'записей')}: хеши совпали, связи не нарушены.</p></div>`;
      } else {
        const list = report.problems.slice(0, 6).map((p) => `<li>Запись #${p.i}: ${esc(p.kind)}</li>`).join('');
        output.innerHTML = `<div class="notice bad"><div><p><strong>Цепочка нарушена: ${plural(report.problems.length, 'проблема', 'проблемы', 'проблем')}.</strong></p><ul style="margin:0;padding-left:20px">${list}</ul><p style="margin-top:8px" class="tiny">Именно так обнаруживается подделка: запись изменена, и следующая за ней ссылается уже не на тот хеш. Скрыть правку можно, только пересчитав заново всю остальную цепочку — а её копии есть у наблюдателей.</p></div></div>`;
        repairBtn.hidden = false;
      }
    });

    root.querySelector('#export').addEventListener('click', () => {
      ctx.download('reestr-eg-demo.json', store.exportChain(), 'application/json');
    });

    root.querySelector('#tamper').addEventListener('click', async () => {
      const block = await store.tamperWithChain();
      if (!block) return;
      ctx.toast(`Запись #${block.i} изменена. Запустите проверку целостности.`);
      output.innerHTML = `<div class="notice warn"><p>В записи <strong>#${block.i}</strong> подменён вариант, а её собственный хеш пересчитан — так поступил бы тот, кто хочет скрыть правку. Нажмите «Проверить целостность»: следующая запись всё ещё ссылается на прежний хеш, и разрыв виден.</p></div>`;
      repairBtn.hidden = false;
    });

    repairBtn.addEventListener('click', async () => {
      await store.repairChain();
      ctx.toast('Цепочка пересобрана');
      ctx.render();
    });
  }

  return { title: 'Реестр — ЭГ-Демо', html, mount };
}

/* ————— как устроено ————— */

export function about() {
  const html = `
    <div class="page-head">
      <h1>Как устроен прототип</h1>
      <p class="muted">Здесь показаны три свойства, которых обычно ждут от электронного голосования: тайна голоса, возможность проверить свой бюллетень и невозможность тихо переписать итоги.</p>
    </div>

    <div class="card">
      <h2>Путь бюллетеня</h2>
      <ol class="muted" style="padding-left:20px">
        <li><strong>Проверка избирателя.</strong> Бот выдаёт одноразовый код: пять минут жизни, три попытки, гашение после первого входа. Из идентификатора аккаунта считается токен <span class="mono">SHA-256(«tg:» + id)</span> — он и определяет, что бюллетень выдаётся один раз.</li>
        <li><strong>Выдача бюллетеня.</strong> В список выдачи попадает <span class="mono">SHA-256(токен + голосование)</span> — он отвечает только на вопрос «брал ли этот избиратель бюллетень».</li>
        <li><strong>Подача голоса.</strong> Браузер генерирует случайную соль и кладёт в реестр вариант и подтверждение <span class="mono">SHA-256(вариант + соль)</span>. Токена избирателя в записи нет.</li>
        <li><strong>Квитанция.</strong> Это первые 16 символов хеша записи. Соль остаётся у избирателя — она и есть доказательство авторства.</li>
        <li><strong>Проверка.</strong> По квитанции запись находится в реестре; соль позволяет пересчитать подтверждение и убедиться, что учтён именно ваш вариант.</li>
      </ol>
    </div>

    <div class="card">
      <h2>Почему подделка заметна</h2>
      <p class="muted">Запись № n содержит хеш записи № n−1, а её собственный хеш считается из всего содержимого. Изменение варианта в старой записи меняет её хеш, и следующая запись начинает ссылаться на несуществующее значение. Спрятать правку можно, только переписав всю цепочку до конца — что невозможно, если её копии уже разошлись по наблюдателям. На <a href="#/reestr">странице реестра</a> это можно проделать своими руками: кнопка «Подделать запись» ломает цепочку, «Проверить целостность» показывает, где именно.</p>
    </div>

    <div class="card">
      <h2>Чего этот прототип не делает</h2>
      <ul class="muted" style="padding-left:20px">
        <li><strong>Не проверяет личность.</strong> Код из мессенджера подтверждает владение аккаунтом, а не то, что перед экраном именно этот избиратель и что он вообще внесён в список. Аккаунты продаются пачками вместе с номерами, поэтому от организованной накрутки такая привязка не спасает — в демо это видно по кнопке «Взять другой аккаунт». Настоящая система опирается на подтверждённую идентификацию и список избирателей.</li>
        <li><strong>Не имеет настоящего бота.</strong> Бот здесь симулирован: статический сайт не может хранить токен бота и проверять коды — это работа сервера.</li>
        <li><strong>Не шифрует голоса до конца подсчёта.</strong> В работающих системах применяют гомоморфное шифрование или перемешивающие сети, чтобы вариант был скрыт до завершения голосования. Здесь вариант лежит в реестре открыто — тайна держится лишь на отсутствии связи с избирателем.</li>
        <li><strong>Не защищает от давления на избирателя.</strong> Квитанция плюс соль позволяют избирателю доказать свой выбор — значит, и показать его тому, кто требует отчёта. Реальные системы борются с этим переголосованием и фиктивными квитанциями.</li>
        <li><strong>Не имеет распределённого реестра и наблюдателей.</strong> Цепочка живёт в одном браузере, её некому независимо заверить. Настоящая проверяемость требует нескольких независимых узлов и открытого наблюдения.</li>
        <li><strong>Не хранит данные на сервере.</strong> Сайт статичен: очистка данных браузера стирает и «реестр», и вашу соль.</li>
      </ul>
      <div class="notice warn" style="margin-top:14px">
        <p>Проект учебный и не связан с государственными информационными системами, избирательными комиссиями и какими-либо официальными сервисами. Результаты, кандидаты и организации вымышлены, юридической силы голосование не имеет.</p>
      </div>
    </div>

    <div class="card">
      <h2>Данные и сброс</h2>
      <p class="muted">Всё состояние демо хранится в <span class="mono">localStorage</span> под ключом <span class="mono">eg-demo.v2</span>. Можно очистить его и начать с чистого листа — реестр будет сгенерирован заново.</p>
      ${hasWebCrypto ? '' : '<div class="notice warn"><p>Web Crypto недоступен в текущем контексте, используется упрощённая замена хеша. Откройте страницу по https, чтобы работал настоящий SHA-256.</p></div>'}
      <div class="btn-row"><button class="btn secondary" type="button" id="reset">Сбросить демо</button></div>
    </div>`;

  function mount(root, ctx) {
    root.querySelector('#reset').addEventListener('click', async () => {
      if (!confirm('Удалить все данные демо, включая ваши квитанции и соли?')) return;
      store.resetAll();
      await store.seedIfNeeded();
      ctx.toast('Демо сброшено');
      location.hash = '#/';
      ctx.render();
    });
  }

  return { title: 'Как устроено — ЭГ-Демо', html, mount };
}

export function notFound() {
  return {
    title: 'Страница не найдена — ЭГ-Демо',
    html: `<div class="card"><h1>Страница не найдена</h1><p class="muted">Такого раздела нет.</p><a class="btn" href="#/">На главную</a></div>`
  };
}
