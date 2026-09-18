// Демонстрационные голосования. Организации, кандидаты и цифры вымышлены.

export const ELECTIONS = [
  {
    id: 'sovet-doma',
    title: 'Выборы председателя совета дома № 14',
    org: 'Демо-округ «Северный», ул. Приморская, д. 14',
    question: 'Кого вы поддерживаете на должность председателя совета дома?',
    opensAt: '2026-09-14T08:00:00+03:00',
    closesAt: '2026-09-27T20:00:00+03:00',
    electorate: 412,
    seedVotes: 168,
    options: [
      { id: 'a', name: 'Иванова Анна Сергеевна', note: 'самовыдвижение, кв. 61', weight: 44 },
      { id: 'b', name: 'Петров Борис Михайлович', note: 'самовыдвижение, кв. 12', weight: 33 },
      { id: 'c', name: 'Сидорова Вера Кирилловна', note: 'выдвинута собранием жильцов', weight: 17 },
      { id: 'none', name: 'Против всех кандидатов', note: 'бюллетень учитывается в явке', weight: 6 }
    ]
  },
  {
    id: 'blagoustroystvo',
    title: 'Выбор проекта благоустройства двора',
    org: 'Демо-округ «Северный», квартал 3',
    question: 'Какой проект реализовать за счёт средств программы благоустройства?',
    opensAt: '2026-09-01T08:00:00+03:00',
    closesAt: '2026-10-05T20:00:00+03:00',
    electorate: 1860,
    seedVotes: 742,
    options: [
      { id: 'park', name: 'Сквер с зоной тихого отдыха', note: 'озеленение, скамьи, освещение', weight: 38 },
      { id: 'kids', name: 'Детская и спортивная площадка', note: 'игровой комплекс, воркаут', weight: 41 },
      { id: 'park2', name: 'Дополнительная парковка', note: '46 машиномест', weight: 21 }
    ]
  },
  {
    id: 'razdelnyy-sbor',
    title: 'Опрос ТСЖ: переход на раздельный сбор отходов',
    org: 'ТСЖ «Демо-Гарант»',
    question: 'Поддерживаете ли вы установку контейнеров для раздельного сбора отходов?',
    opensAt: '2026-09-10T08:00:00+03:00',
    closesAt: '2026-09-24T20:00:00+03:00',
    electorate: 260,
    seedVotes: 97,
    options: [
      { id: 'yes', name: 'Да, поддерживаю', note: '', weight: 63 },
      { id: 'no', name: 'Нет, не поддерживаю', note: '', weight: 28 },
      { id: 'abstain', name: 'Воздерживаюсь', note: '', weight: 9 }
    ]
  },
  {
    id: 'grafik-uborki',
    title: 'График уборки придомовой территории',
    org: 'Демо-округ «Северный», ул. Приморская, д. 14',
    question: 'Какой график уборки выбрать на следующий год?',
    opensAt: '2026-06-01T08:00:00+03:00',
    closesAt: '2026-06-20T20:00:00+03:00',
    electorate: 412,
    seedVotes: 231,
    options: [
      { id: 'daily', name: 'Ежедневно, кроме воскресенья', note: '', weight: 52 },
      { id: 'three', name: 'Три раза в неделю', note: '', weight: 35 },
      { id: 'two', name: 'Два раза в неделю', note: '', weight: 13 }
    ]
  }
];

export function getElection(id) {
  return ELECTIONS.find((e) => e.id === id) || null;
}

export function electionStatus(election, now = Date.now()) {
  const opens = Date.parse(election.opensAt);
  const closes = Date.parse(election.closesAt);
  if (now < opens) return 'soon';
  if (now > closes) return 'done';
  return 'active';
}

export const STATUS_LABEL = {
  active: 'Идёт голосование',
  soon: 'Ещё не началось',
  done: 'Завершено'
};

// Сроки голосований заданы по московскому времени — показываем их так же,
// независимо от часового пояса читателя.
const DATE_FMT = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow'
});

export function formatDate(value) {
  const ts = typeof value === 'number' ? value : Date.parse(value);
  return Number.isNaN(ts) ? '—' : `${DATE_FMT.format(new Date(ts))} МСК`;
}

export function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
