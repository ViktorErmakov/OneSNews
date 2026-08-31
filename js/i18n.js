/** UI locale for OneS News. Content language and chrome share one preference. */
(function () {
	'use strict';

	const KEY = 'ones-language';
	const CODES = ['ru', 'en'];
	const EVENT = 'ones-locale';

	const STRINGS = {
		ru: {
			meta: {
				feedTitle: 'OneS News',
				feedDescription:
					'Ежедневный дайджест новостей вокруг мира 1С — в первую очередь для разработчиков.',
				settingsTitle: 'Настройки — OneS News',
				settingsDescription:
					'Настройки OneS News: какие источники показывать на ленте и что хранится в браузере.',
			},
			skip: 'К содержанию',
			nav: { appearance: 'Оформление', about: 'О сайте' },
			settings: 'Настройки',
			language: 'Язык',
			date: 'Дата',
			calendar: 'Календарь',
			source: 'Источник',
			sourceAll: 'Все',
			search: {
				placeholder: 'Поиск по заголовкам и описаниям',
				clear: 'Сбросить поиск',
				history: 'Недавние запросы',
				remove: 'Удалить запрос «{query}»',
			},
			loading: 'Загрузка…',
			sections: 'Разделы дня',
			feed: 'Лента',
			feedback: 'Пожелания',
			read: 'Прочитано',
			readUndo: 'Отменить',
			unmarkRead: 'Снять отметку «прочитано»',
			opensNewTab: '{title} (откроется в новой вкладке)',
			filterSource: 'Фильтр по источнику: {name}',
			dayTitle: 'Дайджест за {date}',
			calendarPrev: 'Предыдущий месяц',
			calendarNext: 'Следующий месяц',
			weekdays: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
			materials: { one: '{n} материал', few: '{n} материала', many: '{n} материалов' },
			empty: {
				noItems: 'Нет новостей за этот день.',
				noItemsHint: 'Выберите другую дату в календаре.',
				hidden: 'Вы скрыли источники за этот день.',
				hiddenHint:
					'Включите их в <a href="settings.html#sources-heading">списке источников</a>.',
				filters: 'Нет новостей по выбранным фильтрам.',
				filtersHint: 'Снимите фильтр источника либо выберите другую дату.',
				query: 'Ничего не найдено по запросу «{query}».',
				queryHint: 'Измените слова или сбросьте поиск.',
			},
			status: {
				noDates: 'Нет опубликованных дней в data/days',
				indexFail: 'Не удалось загрузить data/index.json',
				dayFail: 'Не удалось загрузить день {date}',
			},
			theme: { light: 'Включить светлую тему', dark: 'Включить тёмную тему' },
			type: { site: 'Сайты', telegram: 'Telegram', video: 'Видеохостинги', other: 'Другое' },
			consent: {
				region: 'Согласие на аналитику',
				text:
					'Для статистики посещений можем включить Яндекс.Метрику. Тема, «прочитано» и поиск остаются только в вашем браузере.',
				more: 'Подробнее',
				accept: 'Принять',
				reject: 'Отклонить',
				enable: 'Включить аналитику',
				disable: 'Отключить аналитику',
				checking: 'Проверяем сохранённый выбор…',
				none: 'Вы ещё не сделали выбор. Счётчик посещений выключен.',
				on: 'Яндекс.Метрика включена. Можно отключить в любой момент — счётчик перестанет загружаться.',
				off: 'Яндекс.Метрика выключена. Функции сайта от этого не зависят.',
			},
			page: {
				heading: 'Настройки',
				about1:
					'OneS News собирает новости вокруг мира 1С из открытых источников и публикует ежедневный дайджест со ссылками на первоисточники.',
				about2:
					'Сайт <strong>не принадлежит</strong> фирме «1С», не является её официальным ресурсом и не использует товарные знаки или эмблемы компании. Мы не представляем фирму «1С».',
				about3:
					'На первом этапе материалы ориентированы в первую очередь на <strong>разработчиков</strong>. На ленте можно фильтровать по источнику и языку; новости сгруппированы по типу источника: сайты, Telegram, видеохостинги.',
				about4Prefix: 'Пожелания, идеи по источникам и замечания к дайджесту можно ',
				writeUs: 'написать нам',
				about4Suffix: '.',
				sources: 'Источники',
				sourcesHow:
					'Свои тексты не пишем: с сайтов берём заголовок и краткое описание, из Telegram — начало поста. Ссылки ведут на сайты и каналы.',
				sourcesHelp:
					'Галочка у языка выключает всю его группу. По умолчанию включён только язык интерфейса, остальные можно отметить. Галочка у категории выключает все её источники, в том числе новые. Галочка у канала — только его. Без галочки источник скрыт во все дни, выбор запоминается в этом браузере. Фильтр на главной только сужает уже открытый день и сбрасывается при смене даты.',
				showAll: 'Показать все',
				privacy: 'Конфиденциальность',
				privacy1: 'Учётной записи нет: мы не принимаем и не храним ваши данные на своей стороне.',
				privacy2: 'В браузере (<code>localStorage</code>) остаются только настройки ленты:',
				privacyTheme:
					'<strong>Тема</strong> (<code>ones-theme</code>) — светлая или тёмная, если вы нажали переключатель.',
				privacyRead:
					'<strong>Прочитанное</strong> (<code>ones-read</code>) — идентификаторы открытых карточек и время отметки, не больше 500 записей и 90 дней.',
				privacySearch:
					'<strong>Поиск</strong> (<code>ones-search-history</code>) — до восьми недавних запросов.',
				privacyHidden:
					'<strong>Скрытые источники</strong> (<code>ones-hidden-sources</code>) — какие каналы не показывать на ленте.',
				privacyTypes:
					'<strong>Скрытые категории</strong> (<code>ones-hidden-types</code>) — какие типы источников не показывать: сайты, Telegram, видеохостинги.',
				privacyHiddenLangs:
					'<strong>Скрытые языки</strong> (<code>ones-hidden-languages</code>) — какие языковые группы не показывать на ленте.',
				privacyLang:
					'<strong>Язык</strong> (<code>ones-language</code>) — язык ленты, календаря и этой страницы.',
				privacyConsent:
					'<strong>Выбор по аналитике</strong> (<code>ones-consent</code>) — чтобы не спрашивать снова.',
				privacyLocal:
					'Их можно стереть в настройках браузера; в режиме инкогнито они не сохранятся. Согласия на эти записи не спрашиваем: это работа ленты.',
				privacyMetrika:
					'По желанию включается <a href="https://metrika.yandex.ru/" rel="noopener noreferrer" target="_blank">Яндекс.Метрика</a> (счётчик 111876187) — <strong>только после кнопки «Принять»</strong>. Вебвизор выключен. Яндекс может видеть адрес страницы, источник перехода, тип устройства и приблизительный регион. Условия: <a href="https://yandex.ru/legal/confidential/" rel="noopener noreferrer" target="_blank">политика конфиденциальности Яндекса</a> и <a href="https://yandex.ru/legal/metrica_termsofuse/" rel="noopener noreferrer" target="_blank">условия Метрики</a>. Отключить можно здесь же.',
				yourChoice: 'Ваш выбор',
				updated: 'Страница обновлена 24 августа 2026.',
				sourcesEmpty: 'Пока нет включённых источников.',
				sourcesFail: 'Не удалось загрузить список источников.',
			},
		},
		en: {
			meta: {
				feedTitle: 'OneS News',
				feedDescription:
					'Daily digest of 1C-world news — primarily for developers.',
				settingsTitle: 'Settings — OneS News',
				settingsDescription:
					'OneS News settings: which sources to show on the feed and what is stored in the browser.',
			},
			skip: 'Skip to content',
			nav: { appearance: 'Appearance', about: 'About' },
			settings: 'Settings',
			language: 'Language',
			date: 'Date',
			calendar: 'Calendar',
			source: 'Source',
			sourceAll: 'All',
			search: {
				placeholder: 'Search titles and summaries',
				clear: 'Clear search',
				history: 'Recent searches',
				remove: 'Remove query “{query}”',
			},
			loading: 'Loading…',
			sections: 'Sections of the day',
			feed: 'Feed',
			feedback: 'Feedback',
			read: 'Read',
			readUndo: 'Undo',
			unmarkRead: 'Remove read mark',
			opensNewTab: '{title} (opens in a new tab)',
			filterSource: 'Filter by source: {name}',
			dayTitle: 'Digest for {date}',
			calendarPrev: 'Previous month',
			calendarNext: 'Next month',
			weekdays: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
			materials: { one: '{n} item', few: '{n} items', many: '{n} items' },
			empty: {
				noItems: 'No news for this day.',
				noItemsHint: 'Pick another date in the calendar.',
				hidden: 'You hid the sources for this day.',
				hiddenHint: 'Turn them back on in the <a href="settings.html#sources-heading">source list</a>.',
				filters: 'No news matches the selected filters.',
				filtersHint: 'Clear the source filter or pick another date.',
				query: 'Nothing found for “{query}”.',
				queryHint: 'Change the words or clear the search.',
			},
			status: {
				noDates: 'No published days in data/days',
				indexFail: 'Could not load data/index.json',
				dayFail: 'Could not load day {date}',
			},
			theme: { light: 'Switch to light theme', dark: 'Switch to dark theme' },
			type: { site: 'Sites', telegram: 'Telegram', video: 'Video hosts', other: 'Other' },
			consent: {
				region: 'Analytics consent',
				text:
					'We can enable Yandex Metrica for visit statistics. Theme, read marks and search stay only in your browser.',
				more: 'Learn more',
				accept: 'Accept',
				reject: 'Decline',
				enable: 'Enable analytics',
				disable: 'Disable analytics',
				checking: 'Checking saved choice…',
				none: 'You have not chosen yet. The visit counter is off.',
				on: 'Yandex Metrica is on. You can turn it off at any time — the counter will stop loading.',
				off: 'Yandex Metrica is off. The rest of the site still works.',
			},
			page: {
				heading: 'Settings',
				about1:
					'OneS News collects 1C-world news from public sources and publishes a daily digest with links to the originals.',
				about2:
					'The site is <strong>not affiliated</strong> with the 1C company, is not its official resource, and does not use the company’s trademarks or emblems. We do not represent 1C.',
				about3:
					'At this stage the materials are aimed primarily at <strong>developers</strong>. The feed can be filtered by source and language; news is grouped by source type: sites, Telegram, video hosts.',
				about4Prefix: 'Suggestions, source ideas and notes about the digest can be sent by ',
				writeUs: 'writing to us',
				about4Suffix: '.',
				sources: 'Sources',
				sourcesHow:
					'We do not write our own copy: from sites we take the title and a short description, from Telegram — the start of the post. Links go to the sites and channels.',
				sourcesHelp:
					'A language checkbox turns off that whole group. By default only the interface language is on; you can tick others to read them too. A category checkbox turns off all of its sources, including new ones. A channel checkbox affects only that channel. Unchecked sources stay hidden on every day; the choice is remembered in this browser. The home-page filter only narrows the open day and resets when the date changes.',
				showAll: 'Show all',
				privacy: 'Privacy',
				privacy1: 'There is no account: we do not collect or store your data on our side.',
				privacy2: 'The browser (<code>localStorage</code>) keeps only feed settings:',
				privacyTheme:
					'<strong>Theme</strong> (<code>ones-theme</code>) — light or dark, if you used the toggle.',
				privacyRead:
					'<strong>Read marks</strong> (<code>ones-read</code>) — ids of opened cards and the time of the mark, at most 500 entries and 90 days.',
				privacySearch:
					'<strong>Search</strong> (<code>ones-search-history</code>) — up to eight recent queries.',
				privacyHidden:
					'<strong>Hidden sources</strong> (<code>ones-hidden-sources</code>) — which channels not to show on the feed.',
				privacyTypes:
					'<strong>Hidden categories</strong> (<code>ones-hidden-types</code>) — which source types not to show: sites, Telegram, video hosts.',
				privacyHiddenLangs:
					'<strong>Hidden languages</strong> (<code>ones-hidden-languages</code>) — which language groups not to show on the feed.',
				privacyLang:
					'<strong>Language</strong> (<code>ones-language</code>) — language of the feed, calendar and this page.',
				privacyConsent:
					'<strong>Analytics choice</strong> (<code>ones-consent</code>) — so we do not ask again.',
				privacyLocal:
					'You can erase them in the browser settings; they are not kept in private mode. We do not ask consent for these records: they make the feed work.',
				privacyMetrika:
					'Optionally we enable <a href="https://metrika.yandex.ru/" rel="noopener noreferrer" target="_blank">Yandex Metrica</a> (counter 111876187) — <strong>only after the “Accept” button</strong>. Session replay is off. Yandex may see the page address, referrer, device type and approximate region. Terms: <a href="https://yandex.ru/legal/confidential/" rel="noopener noreferrer" target="_blank">Yandex privacy policy</a> and <a href="https://yandex.ru/legal/metrica_termsofuse/" rel="noopener noreferrer" target="_blank">Metrica terms</a>. You can turn it off here.',
				yourChoice: 'Your choice',
				updated: 'Page updated 24 August 2026.',
				sourcesEmpty: 'No enabled sources yet.',
				sourcesFail: 'Could not load the source list.',
			},
		},
	};

	let locale = 'ru';

	function isCode(value) {
		return CODES.indexOf(value) !== -1;
	}

	function fromNavigator() {
		const nav = String(
			(typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || 'ru',
		).toLowerCase();
		return nav.indexOf('en') === 0 ? 'en' : 'ru';
	}

	function fromStorage() {
		try {
			const stored = localStorage.getItem(KEY);
			if (isCode(stored)) return stored;
		} catch (err) {
			/* ignore */
		}
		return '';
	}

	function fromQuery() {
		try {
			const value = new URLSearchParams(window.location.search).get('lang');
			if (isCode(value)) return value;
		} catch (err) {
			/* ignore */
		}
		return '';
	}

	function fromHtml() {
		const value = document.documentElement.getAttribute('lang');
		return isCode(value) ? value : '';
	}

	function resolveLocale() {
		return fromQuery() || fromStorage() || fromHtml() || fromNavigator();
	}

	function persist(code) {
		try {
			localStorage.setItem(KEY, code);
		} catch (err) {
			/* ignore */
		}
	}

	function lookup(dict, key) {
		const parts = String(key || '').split('.');
		let cur = dict;
		for (let i = 0; i < parts.length; i += 1) {
			if (cur == null || typeof cur !== 'object') return null;
			cur = cur[parts[i]];
		}
		return cur;
	}

	function interpolate(value, vars) {
		if (!vars) return value;
		return String(value).replace(/\{(\w+)\}/g, (_, name) =>
			vars[name] == null ? '{' + name + '}' : String(vars[name]),
		);
	}

	function t(key, vars) {
		const dict = STRINGS[locale] || STRINGS.ru;
		let value = lookup(dict, key);
		if (value == null) value = lookup(STRINGS.ru, key);
		if (value == null) return key;
		if (typeof value !== 'string') return value;
		return interpolate(value, vars);
	}

	function applyNode(node) {
		if (!node || node.nodeType !== 1) return;
		const key = node.getAttribute('data-i18n');
		if (key) node.textContent = t(key);
		const htmlKey = node.getAttribute('data-i18n-html');
		if (htmlKey) node.innerHTML = t(htmlKey);
		const aria = node.getAttribute('data-i18n-aria');
		if (aria) node.setAttribute('aria-label', t(aria));
		const placeholder = node.getAttribute('data-i18n-placeholder');
		if (placeholder) node.setAttribute('placeholder', t(placeholder));
		const title = node.getAttribute('data-i18n-title');
		if (title) node.setAttribute('title', t(title));
		const content = node.getAttribute('data-i18n-content');
		if (content) node.setAttribute('content', t(content));
	}

	function apply(root) {
		const scope = root || document;
		if (scope.querySelectorAll) {
			scope.querySelectorAll('[data-i18n], [data-i18n-html], [data-i18n-aria], [data-i18n-placeholder], [data-i18n-title], [data-i18n-content]').forEach(applyNode);
		}
		if (scope === document || scope === document.documentElement || scope === document.body) {
			applyNode(document.querySelector('title'));
			document.querySelectorAll('meta[data-i18n-content]').forEach(applyNode);
		}
	}

	const MONTHS_GEN = {
		ru: [
			'января',
			'февраля',
			'марта',
			'апреля',
			'мая',
			'июня',
			'июля',
			'августа',
			'сентября',
			'октября',
			'ноября',
			'декабря',
		],
		en: [
			'January',
			'February',
			'March',
			'April',
			'May',
			'June',
			'July',
			'August',
			'September',
			'October',
			'November',
			'December',
		],
	};
	const MONTHS_TITLE = {
		ru: [
			'Январь',
			'Февраль',
			'Март',
			'Апрель',
			'Май',
			'Июнь',
			'Июль',
			'Август',
			'Сентябрь',
			'Октябрь',
			'Ноябрь',
			'Декабрь',
		],
		en: MONTHS_GEN.en,
	};

	function parseIsoDate(iso) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
		if (!match) return null;
		return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
	}

	function formatLongDate(iso) {
		const parsed = parseIsoDate(iso);
		if (!parsed) return iso || '';
		const months = MONTHS_GEN[locale] || MONTHS_GEN.ru;
		if (locale === 'en') {
			return `${months[parsed.month]} ${parsed.day}, ${parsed.year}`;
		}
		return `${parsed.day} ${months[parsed.month]} ${parsed.year}`;
	}

	function formatDayTitle(iso) {
		return t('dayTitle', { date: formatLongDate(iso) });
	}

	function formatDateLabel(iso) {
		return formatLongDate(iso) || t('date');
	}

	function formatDateNumeric(iso) {
		const parsed = parseIsoDate(iso);
		if (!parsed) return iso || t('date');
		const day = String(parsed.day).padStart(2, '0');
		const month = String(parsed.month + 1).padStart(2, '0');
		return `${day}.${month}.${parsed.year}`;
	}

	function monthTitle(year, month) {
		const months = MONTHS_TITLE[locale] || MONTHS_TITLE.ru;
		return `${months[month]} ${year}`;
	}

	function weekdays() {
		const list = t('weekdays');
		return Array.isArray(list) ? list : STRINGS.ru.weekdays;
	}

	function materialsLabel(count) {
		const n = Number(count) || 0;
		let form = 'many';
		if (locale === 'en') {
			form = n === 1 ? 'one' : 'many';
		} else {
			const mod10 = n % 10;
			const mod100 = n % 100;
			if (mod10 === 1 && mod100 !== 11) form = 'one';
			else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = 'few';
		}
		return t('materials.' + form, { n: n });
	}

	function sourceTypeLabel(code) {
		const key = 'type.' + code;
		const label = t(key);
		return label === key ? code : label;
	}

	function setLocale(code, options) {
		const next = isCode(code) ? code : 'ru';
		const silent = options && options.silent;
		locale = next;
		document.documentElement.setAttribute('lang', next);
		if (!options || options.persist !== false) persist(next);
		apply(document);
		if (!silent) {
			document.dispatchEvent(new CustomEvent(EVENT, { detail: { locale: next } }));
		}
		return next;
	}

	function flagSvg(code) {
		if (code === 'ru') {
			return (
				'<svg class="flag-icon" viewBox="0 0 9 6" aria-hidden="true">' +
				'<rect width="9" height="2" fill="#fff"/>' +
				'<rect y="2" width="9" height="2" fill="#0039a6"/>' +
				'<rect y="4" width="9" height="2" fill="#d52b1e"/>' +
				'</svg>'
			);
		}
		if (code === 'en') {
			return (
				'<svg class="flag-icon" viewBox="0 0 60 30" aria-hidden="true">' +
				'<rect width="60" height="30" fill="#012169"/>' +
				'<path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" stroke-width="10"/>' +
				'<path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" stroke-width="6"/>' +
				'<path d="M30 0 V30 M0 15 H60" stroke="#fff" stroke-width="16"/>' +
				'<path d="M30 0 V30 M0 15 H60" stroke="#C8102E" stroke-width="10"/>' +
				'</svg>'
			);
		}
		return (
			'<svg class="globe-icon" viewBox="0 0 24 24" aria-hidden="true">' +
			'<circle cx="12" cy="12" r="9"/>' +
			'<ellipse cx="12" cy="12" rx="4" ry="9"/>' +
			'<path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21C9.5 18.2 8.2 15.2 8.2 12S9.5 5.8 12 3z"/>' +
			'</svg>'
		);
	}

	locale = resolveLocale();
	document.documentElement.setAttribute('lang', locale);
	if (!fromStorage()) persist(locale);

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', () => apply(document));
	} else {
		apply(document);
	}

	window.ONES_I18N = {
		KEY: KEY,
		EVENT: EVENT,
		CODES: CODES,
		t: t,
		apply: apply,
		setLocale: setLocale,
		persist: persist,
		resolveLocale: resolveLocale,
		fromQuery: fromQuery,
		flagSvg: flagSvg,
		formatDayTitle: formatDayTitle,
		formatDateLabel: formatDateLabel,
		formatDateNumeric: formatDateNumeric,
		monthTitle: monthTitle,
		weekdays: weekdays,
		materialsLabel: materialsLabel,
		sourceTypeLabel: sourceTypeLabel,
		parseIsoDate: parseIsoDate,
		get locale() {
			return locale;
		},
	};
})();
