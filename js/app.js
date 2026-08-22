(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
	const MONTHS_GEN = [
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
	];
	const MONTHS_TITLE = [
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
	];

	const state = {
		index: null,
		currentDay: null,
		dates: [],
		dateSet: new Set(),
		date: null,
		calendar: { year: 2026, month: 0 },
		direction: '',
		language: '',
		readMap: {},
	};

	const READ_KEY = 'ones-read';
	const READ_MAX = 500;
	const READ_TTL_MS = 90 * 24 * 60 * 60 * 1000;

	const els = {
		datePicker: document.querySelector('#date-picker'),
		dateBtn: document.querySelector('#date-picker-btn'),
		datePanel: document.querySelector('#date-picker-panel'),
		langPicker: document.querySelector('#lang-picker'),
		langBtn: document.querySelector('#lang-picker-btn'),
		langList: document.querySelector('#lang-picker-list'),
		directionPills: document.querySelector('#direction-pills'),
		dayTitle: document.querySelector('#day-title'),
		dayCount: document.querySelector('#day-count'),
		sectionNav: document.querySelector('#section-nav'),
		feed: document.querySelector('#feed'),
		status: document.querySelector('#status'),
		chrome: document.querySelector('.chrome'),
	};

	const GLOBE_SVG =
		'<svg class="globe-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<circle cx="12" cy="12" r="9"/>' +
		'<ellipse cx="12" cy="12" rx="4" ry="9"/>' +
		'<path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9S14.5 18.2 12 21C9.5 18.2 8.2 15.2 8.2 12S9.5 5.8 12 3z"/>' +
		'</svg>';

	const CALENDAR_SVG =
		'<svg class="picker-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<rect x="3.5" y="5.5" width="17" height="15" rx="2"/>' +
		'<path d="M3.5 10.5h17M8 3.5v4M16 3.5v4"/>' +
		'</svg>';

	const CARET_SVG =
		'<svg class="picker-caret" viewBox="0 0 12 12" aria-hidden="true">' +
		'<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
		'</svg>';

	const EXTERNAL_SVG =
		'<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<path d="M14 5h5v5M19 5l-9 9M11 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V13"/>' +
		'</svg>';

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
		return GLOBE_SVG;
	}

	function dayItems() {
		return state.currentDay?.items || [];
	}

	function availableLanguages() {
		const present = new Set(dayItems().map((item) => item.language));
		return cfg.LANGUAGES.filter((lang) => present.has(lang.code));
	}

	function itemsForDirections() {
		const items = dayItems();
		if (!state.language) return items;
		return items.filter((item) => item.language === state.language);
	}

	function availableDirections() {
		const present = new Set(itemsForDirections().map((item) => item.direction));
		return cfg.DIRECTIONS.filter((d) => present.has(d.code));
	}

	function languagePickerOptions() {
		const available = availableLanguages();
		if (available.length > 1) {
			return [{ code: '', label: 'Все языки' }].concat(available);
		}
		return available;
	}

	function currentLanguageOption() {
		const options = languagePickerOptions();
		return options.find((opt) => opt.code === state.language) || options[0] || { code: '', label: 'Все языки' };
	}

	function syncLanguageToAvailable() {
		const available = availableLanguages();
		if (available.length === 1) {
			state.language = available[0].code;
			return;
		}
		if (state.language && !available.some((lang) => lang.code === state.language)) {
			state.language = '';
		}
	}

	function syncDirectionToAvailable() {
		const available = availableDirections();
		if (available.length === 1) {
			state.direction = available[0].code;
			return;
		}
		if (state.direction && !available.some((d) => d.code === state.direction)) {
			state.direction = '';
		}
	}

	function syncFiltersToDay() {
		syncLanguageToAvailable();
		syncDirectionToAvailable();
	}

	function emptyFeedMessage() {
		const items = dayItems();
		if (!items.length) return 'Нет новостей за этот день.';
		if (state.language) {
			const inLanguage = items.filter((item) => item.language === state.language);
			if (!inLanguage.length) {
				return `Нет новостей на языке «${labelOf(cfg.LANGUAGES, state.language)}» за этот день.`;
			}
		}
		return 'Нет новостей по выбранным фильтрам.';
	}

	function emptyFeedHint() {
		const items = dayItems();
		if (!items.length) return 'Выберите другую дату в календаре.';
		if (state.language) {
			const inLanguage = items.filter((item) => item.language === state.language);
			if (!inLanguage.length) return 'Смените язык или дату.';
		}
		return 'Снимите фильтр направления или языка либо выберите другую дату.';
	}

	function materialsLabel(count) {
		const n = Number(count) || 0;
		const mod10 = n % 10;
		const mod100 = n % 100;
		let word = 'материалов';
		if (mod10 === 1 && mod100 !== 11) word = 'материал';
		else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'материала';
		return `${n} ${word}`;
	}

	function renderEmpty() {
		return (
			`<p class="empty">` +
			`<span class="empty-lead">${escapeHtml(emptyFeedMessage())}</span>` +
			`<span class="empty-hint">${escapeHtml(emptyFeedHint())}</span>` +
			`</p>`
		);
	}

	function visibleSections(items) {
		return cfg.SOURCE_TYPES.filter((section) => items.some((item) => item.source_type === section.code));
	}

	function renderSectionNav(sections, counts) {
		if (!els.sectionNav) return;
		if (sections.length < 2) {
			els.sectionNav.innerHTML = '';
			els.sectionNav.hidden = true;
			return;
		}
		els.sectionNav.hidden = false;
		els.sectionNav.innerHTML = sections
			.map((section) => {
				const count = counts[section.code] || 0;
				return (
					`<a href="#section-${escapeHtml(section.code)}">` +
					`${escapeHtml(section.label)} · ${count}` +
					`</a>`
				);
			})
			.join('');
	}

	function renderDayHero(itemCount, sections, counts) {
		if (!els.dayTitle) return;
		if (!state.currentDay) {
			if (els.dayCount) els.dayCount.hidden = true;
			if (els.sectionNav) {
				els.sectionNav.innerHTML = '';
				els.sectionNav.hidden = true;
			}
			return;
		}
		els.dayTitle.textContent = state.currentDay.title || state.currentDay.date;
		if (els.dayCount) {
			els.dayCount.hidden = false;
			els.dayCount.textContent = materialsLabel(itemCount);
		}
		renderSectionNav(sections, counts);
	}

	function syncPillsOverflow() {
		const el = els.directionPills;
		if (!el) return;
		if (el.hidden) {
			el.classList.remove('is-overflowing', 'is-scrolled', 'is-at-end');
			return;
		}
		const overflowing = el.scrollWidth > el.clientWidth + 2;
		const atStart = el.scrollLeft <= 2;
		const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
		el.classList.toggle('is-overflowing', overflowing);
		el.classList.toggle('is-scrolled', overflowing && !atStart);
		el.classList.toggle('is-at-end', overflowing && atEnd);
	}

	function bindChromeHeight() {
		if (!els.chrome) return;
		const apply = () => {
			document.documentElement.style.setProperty('--chrome-h', `${els.chrome.offsetHeight}px`);
		};
		if (window.ResizeObserver) {
			new ResizeObserver(apply).observe(els.chrome);
		} else {
			window.addEventListener('resize', apply);
		}
		apply();
	}

	function loadReadMap() {
		try {
			const parsed = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				state.readMap = parsed;
			}
		} catch (err) {
			state.readMap = {};
		}
		const before = Object.keys(state.readMap).length;
		pruneReadMap();
		if (Object.keys(state.readMap).length !== before) saveReadMap();
	}

	function pruneReadMap() {
		const now = Date.now();
		const entries = Object.entries(state.readMap)
			.filter(([, ts]) => typeof ts === 'number' && now - ts < READ_TTL_MS)
			.sort((a, b) => b[1] - a[1])
			.slice(0, READ_MAX);
		state.readMap = Object.fromEntries(entries);
	}

	function saveReadMap() {
		pruneReadMap();
		try {
			localStorage.setItem(READ_KEY, JSON.stringify(state.readMap));
		} catch (err) {
			/* ignore quota / private mode */
		}
	}

	function isRead(id) {
		return Boolean(id && state.readMap[id]);
	}

	function markRead(id) {
		if (!id || isRead(id)) return false;
		state.readMap[id] = Date.now();
		saveReadMap();
		return true;
	}

	function markCardReadFromEvent(event) {
		const link = event.target.closest && event.target.closest('.card-title a');
		if (!link || !els.feed.contains(link)) return;
		const card = link.closest('.card');
		const id = card && card.getAttribute('data-id');
		if (!id) return;
		markRead(id);
		if (card) card.classList.add('is-read');
	}

	function labelOf(list, code) {
		const found = list.find((x) => x.code === code);
		return found ? found.label : code;
	}

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function setStatus(message, isError) {
		if (!els.status) return;
		els.status.textContent = message || '';
		els.status.hidden = !message;
		els.status.classList.toggle('is-error', Boolean(isError));
	}

	function queryDate() {
		const params = new URLSearchParams(window.location.search);
		return params.get('date');
	}

	function setUrlDate(date) {
		const url = new URL(window.location.href);
		url.searchParams.set('date', date);
		window.history.replaceState({}, '', url);
	}

	function parseIsoDate(iso) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
		if (!match) return null;
		return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
	}

	function formatDateLabel(iso) {
		const parsed = parseIsoDate(iso);
		if (!parsed) return iso || 'Дата';
		return `${parsed.day} ${MONTHS_GEN[parsed.month]} ${parsed.year}`;
	}

	function monthIndex(year, month) {
		return year * 12 + month;
	}

	function calendarBounds() {
		if (!state.dates.length) return null;
		const newest = parseIsoDate(state.dates[0]);
		const oldest = parseIsoDate(state.dates[state.dates.length - 1]);
		if (!newest || !oldest) return null;
		return {
			min: monthIndex(oldest.year, oldest.month),
			max: monthIndex(newest.year, newest.month),
		};
	}

	function setCalendarToDate(iso) {
		const parsed = parseIsoDate(iso);
		if (!parsed) return;
		state.calendar = { year: parsed.year, month: parsed.month };
	}

	function shiftCalendar(dir) {
		const next = { year: state.calendar.year, month: state.calendar.month };
		if (dir === 'prev') {
			next.month -= 1;
			if (next.month < 0) {
				next.month = 11;
				next.year -= 1;
			}
		} else {
			next.month += 1;
			if (next.month > 11) {
				next.month = 0;
				next.year += 1;
			}
		}
		const bounds = calendarBounds();
		const idx = monthIndex(next.year, next.month);
		if (bounds && (idx < bounds.min || idx > bounds.max)) return;
		state.calendar = next;
		renderDatePicker();
		els.datePanel.hidden = false;
		els.dateBtn.setAttribute('aria-expanded', 'true');
		const nav = els.datePanel.querySelector(`[data-cal="${dir}"]`);
		if (nav) nav.focus();
	}

	function filteredItems() {
		const items = state.currentDay?.items || [];
		return items.filter((item) => {
			if (state.direction && item.direction !== state.direction) return false;
			if (state.language && item.language !== state.language) return false;
			return true;
		});
	}

	function optionMarkup(value, iconHtml, label, selected) {
		return (
			`<li role="option" tabindex="-1" data-value="${escapeHtml(value)}" ` +
			`aria-selected="${selected}" class="${selected ? 'is-active' : ''}">` +
			iconHtml +
			`<span>${escapeHtml(label)}</span>` +
			`</li>`
		);
	}

	function renderPickerButton(btn, ariaPrefix, iconHtml, label) {
		btn.innerHTML = iconHtml + `<span class="picker-btn-label">${escapeHtml(label)}</span>` + CARET_SVG;
		btn.setAttribute('aria-label', ariaPrefix + ': ' + label);
	}

	function isPickerOpen(panel) {
		return !panel.hidden;
	}

	function closePicker(btn, panel) {
		panel.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
	}

	function closeAllPickers() {
		closePicker(els.dateBtn, els.datePanel);
		closePicker(els.langBtn, els.langList);
	}

	function openPicker(btn, panel) {
		closeAllPickers();
		panel.hidden = false;
		btn.setAttribute('aria-expanded', 'true');
		const selected =
			panel.querySelector('[aria-selected="true"], .calendar-day.is-selected') ||
			panel.querySelector('.calendar-day.has-news') ||
			panel.firstElementChild;
		if (selected) selected.focus();
	}

	function togglePicker(btn, panel) {
		if (isPickerOpen(panel)) closePicker(btn, panel);
		else openPicker(btn, panel);
	}

	function renderCalendarGrid() {
		const year = state.calendar.year;
		const month = state.calendar.month;
		const first = new Date(year, month, 1);
		const startOffset = (first.getDay() + 6) % 7;
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const cells = [];

		for (let i = 0; i < startOffset; i += 1) {
			cells.push('<span class="calendar-day is-empty"></span>');
		}

		for (let day = 1; day <= daysInMonth; day += 1) {
			const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			const hasNews = state.dateSet.has(iso);
			const selected = iso === state.date;
			if (hasNews) {
				cells.push(
					`<button type="button" class="calendar-day has-news${selected ? ' is-selected' : ''}" ` +
						`data-date="${iso}" aria-label="${escapeHtml(formatDateLabel(iso))}" ` +
						`aria-pressed="${selected}">${day}</button>`,
				);
			} else {
				cells.push(`<span class="calendar-day">${day}</span>`);
			}
		}

		return cells.join('');
	}

	function renderDatePicker() {
		const current = state.date || state.dates[0] || '';
		renderPickerButton(els.dateBtn, 'Дата', CALENDAR_SVG, formatDateLabel(current));

		const bounds = calendarBounds();
		const idx = monthIndex(state.calendar.year, state.calendar.month);
		const canPrev = bounds ? idx > bounds.min : false;
		const canNext = bounds ? idx < bounds.max : false;
		const title = `${MONTHS_TITLE[state.calendar.month]} ${state.calendar.year}`;

		els.datePanel.innerHTML =
			`<div class="calendar-head">` +
			`<button type="button" class="calendar-nav" data-cal="prev" aria-label="Предыдущий месяц"${canPrev ? '' : ' disabled'}>‹</button>` +
			`<div class="calendar-title">${escapeHtml(title)}</div>` +
			`<button type="button" class="calendar-nav" data-cal="next" aria-label="Следующий месяц"${canNext ? '' : ' disabled'}>›</button>` +
			`</div>` +
			`<div class="calendar-weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>` +
			`<div class="calendar-grid">${renderCalendarGrid()}</div>`;
	}

	function renderLangPicker() {
		const current = currentLanguageOption();
		renderPickerButton(els.langBtn, 'Язык', flagSvg(current.code), current.label);
		els.langList.innerHTML = languagePickerOptions()
			.map((opt) => optionMarkup(opt.code, flagSvg(opt.code), opt.label, opt.code === state.language))
			.join('');
	}

	function renderDirectionPills() {
		const available = availableDirections();
		if (!available.length) {
			els.directionPills.innerHTML = '';
			els.directionPills.hidden = true;
			syncPillsOverflow();
			return;
		}

		els.directionPills.hidden = false;
		const pills = available.length > 1 ? [{ code: '', label: 'Все' }].concat(available) : available;
		els.directionPills.innerHTML = pills
			.map((pill) => {
				const active = pill.code === state.direction;
				return (
					`<button type="button" class="pill${active ? ' is-active' : ''}" ` +
					`data-direction="${escapeHtml(pill.code)}" aria-pressed="${active}">` +
					escapeHtml(pill.label) +
					`</button>`
				);
			})
			.join('');
		syncPillsOverflow();
		requestAnimationFrame(syncPillsOverflow);
	}

	function syncFilterUi() {
		renderDatePicker();
		renderLangPicker();
		renderDirectionPills();
	}

	function setDirection(code) {
		const available = availableDirections();
		if (available.length === 1) {
			state.direction = available[0].code;
		} else {
			state.direction = code;
		}
		renderDirectionPills();
		renderFeed();
	}

	function setLanguage(code) {
		const available = availableLanguages();
		if (available.length === 1) {
			state.language = available[0].code;
		} else {
			state.language = code;
		}
		closePicker(els.langBtn, els.langList);
		syncDirectionToAvailable();
		renderLangPicker();
		renderDirectionPills();
		renderFeed();
	}

	function toggleFilter(kind, code) {
		if (kind === 'direction') {
			const available = availableDirections();
			if (available.length === 1) {
				setDirection(available[0].code);
				return;
			}
			setDirection(state.direction === code ? '' : code);
			return;
		}
		if (kind === 'language') {
			const available = availableLanguages();
			if (available.length === 1) {
				setLanguage(available[0].code);
				return;
			}
			setLanguage(state.language === code ? '' : code);
		}
	}

	function renderCard(item) {
		const direction = labelOf(cfg.DIRECTIONS, item.direction);
		const language = labelOf(cfg.LANGUAGES, item.language);
		const dirActive = state.direction === item.direction;
		const langActive = state.language === item.language;
		const read = isRead(item.id);
		const title = escapeHtml(item.title);
		return (
			`<article class="card${read ? ' is-read' : ''}" data-id="${escapeHtml(item.id)}">` +
			`<h3 class="card-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" ` +
			`aria-label="${title} (откроется в новой вкладке)">${title}${EXTERNAL_SVG}</a></h3>` +
			`<p class="card-summary">${escapeHtml(item.summary)}</p>` +
			`<div class="card-meta">` +
			`<span>${escapeHtml(item.source_name)}</span>` +
			`<span>${escapeHtml(item.author || 'Не указан')}</span>` +
			`<button type="button" class="chip${dirActive ? ' is-active' : ''}" data-filter="direction" ` +
			`data-value="${escapeHtml(item.direction)}" aria-pressed="${dirActive}" ` +
			`title="Фильтр по направлению: ${escapeHtml(direction)}" ` +
			`aria-label="Фильтр по направлению: ${escapeHtml(direction)}">${escapeHtml(direction)}</button>` +
			`<button type="button" class="chip${langActive ? ' is-active' : ''}" data-filter="language" ` +
			`data-value="${escapeHtml(item.language)}" aria-pressed="${langActive}" ` +
			`title="Фильтр по языку: ${escapeHtml(language)}" ` +
			`aria-label="Фильтр по языку: ${escapeHtml(language)}">${escapeHtml(language)}</button>` +
			`<span class="read-badge">Прочитано</span>` +
			`</div>` +
			`</article>`
		);
	}

	function renderFeed() {
		if (!state.currentDay) {
			els.feed.innerHTML = '';
			renderDayHero(0, [], {});
			return;
		}

		const items = filteredItems();
		const counts = {};
		const sections = visibleSections(items);
		sections.forEach((section) => {
			counts[section.code] = items.filter((item) => item.source_type === section.code).length;
		});
		renderDayHero(items.length, sections, counts);

		if (!items.length) {
			els.feed.innerHTML = renderEmpty();
			return;
		}

		const parts = [];
		cfg.SOURCE_TYPES.forEach((section) => {
			const sectionItems = items.filter((item) => item.source_type === section.code);
			if (!sectionItems.length) return;
			const count = sectionItems.length;
			parts.push(`<section class="section" id="section-${escapeHtml(section.code)}">`);
			parts.push(
				`<h2 class="section-title">${escapeHtml(section.label)} ` +
					`<span class="section-count">· ${count}</span></h2>`,
			);
			parts.push(`<div class="cards">${sectionItems.map(renderCard).join('')}</div>`);
			parts.push(`</section>`);
		});

		els.feed.innerHTML = parts.join('') || renderEmpty();
	}

	async function dateFileExists(date) {
		const url = `data/days/${date}.json`;
		try {
			const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
			if (head.ok) return true;
			const get = await fetch(url, { method: 'GET', cache: 'no-store' });
			return get.ok;
		} catch (err) {
			return false;
		}
	}

	async function datesFromDirectoryListing() {
		try {
			const res = await fetch('data/days/', { cache: 'no-store' });
			if (!res.ok) return [];
			const text = await res.text();
			const found = new Set();
			const re = /(\d{4}-\d{2}-\d{2})\.json/g;
			let match;
			while ((match = re.exec(text))) found.add(match[1]);
			return Array.from(found);
		} catch (err) {
			return [];
		}
	}

	async function listAvailableDates() {
		const fromDir = await datesFromDirectoryListing();
		let candidates = fromDir;
		if (!candidates.length) {
			const indexRes = await fetch('data/index.json', { cache: 'no-store' });
			if (!indexRes.ok) throw new Error('Не удалось загрузить data/index.json');
			state.index = await indexRes.json();
			candidates = state.index.dates || [];
		} else {
			try {
				const indexRes = await fetch('data/index.json', { cache: 'no-store' });
				if (indexRes.ok) state.index = await indexRes.json();
			} catch (err) {
				/* listing is enough */
			}
		}

		const unique = Array.from(new Set(candidates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))));
		const existing = await Promise.all(
			unique.map(async (date) => ((await dateFileExists(date)) ? date : null)),
		);
		return existing.filter(Boolean).sort().reverse();
	}

	async function loadDay(date) {
		setStatus('Загрузка…');
		const res = await fetch(`data/days/${date}.json`, { cache: 'no-store' });
		if (!res.ok) throw new Error(`Не удалось загрузить день ${date}`);
		const day = await res.json();
		state.currentDay = day;
		state.date = date;
		setCalendarToDate(date);
		setUrlDate(date);
		syncFiltersToDay();
		renderDatePicker();
		renderLangPicker();
		renderDirectionPills();
		setStatus('');
		renderFeed();
	}

	async function changeDate(date) {
		if (!date || date === state.date) {
			closePicker(els.dateBtn, els.datePanel);
			return;
		}
		closeAllPickers();
		try {
			await loadDay(date);
		} catch (err) {
			setStatus(err.message || String(err), true);
		}
	}

	function optionFromTarget(target) {
		return target && target.closest ? target.closest('[role="option"]') : null;
	}

	function bindLangPicker() {
		els.langBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			togglePicker(els.langBtn, els.langList);
		});

		els.langList.addEventListener('click', (event) => {
			event.stopPropagation();
			const option = optionFromTarget(event.target);
			if (!option) return;
			setLanguage(option.getAttribute('data-value') || '');
		});

		els.langBtn.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openPicker(els.langBtn, els.langList);
			}
		});

		els.langList.addEventListener('keydown', (event) => {
			const options = Array.from(els.langList.querySelectorAll('[role="option"]'));
			const current = document.activeElement;
			const index = options.indexOf(current);

			if (event.key === 'Escape') {
				event.preventDefault();
				closePicker(els.langBtn, els.langList);
				els.langBtn.focus();
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				(options[Math.min(index + 1, options.length - 1)] || options[0]).focus();
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				(options[Math.max(index - 1, 0)] || options[0]).focus();
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				const option = optionFromTarget(current);
				if (option) setLanguage(option.getAttribute('data-value') || '');
				els.langBtn.focus();
			}
		});
	}

	function bindDatePicker() {
		els.dateBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			if (isPickerOpen(els.datePanel)) {
				closePicker(els.dateBtn, els.datePanel);
				return;
			}
			setCalendarToDate(state.date || state.dates[0]);
			renderDatePicker();
			openPicker(els.dateBtn, els.datePanel);
		});

		els.datePanel.addEventListener('click', (event) => {
			event.stopPropagation();
			const nav = event.target.closest('[data-cal]');
			if (nav) {
				if (nav.disabled) return;
				shiftCalendar(nav.getAttribute('data-cal'));
				return;
			}
			const day = event.target.closest('[data-date]');
			if (day) changeDate(day.getAttribute('data-date') || '');
		});

		els.dateBtn.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				setCalendarToDate(state.date || state.dates[0]);
				renderDatePicker();
				openPicker(els.dateBtn, els.datePanel);
			}
		});

		els.datePanel.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				closePicker(els.dateBtn, els.datePanel);
				els.dateBtn.focus();
			}
		});
	}

	async function init() {
		loadReadMap();
		bindChromeHeight();
		bindDatePicker();
		bindLangPicker();

		document.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Node) || !target.isConnected) return;
			if (!els.datePicker.contains(target)) closePicker(els.dateBtn, els.datePanel);
			if (!els.langPicker.contains(target)) closePicker(els.langBtn, els.langList);
		});

		els.directionPills.addEventListener('click', (event) => {
			const pill = event.target.closest('[data-direction]');
			if (!pill) return;
			setDirection(pill.getAttribute('data-direction') || '');
		});
		els.directionPills.addEventListener('scroll', syncPillsOverflow, { passive: true });
		window.addEventListener('resize', syncPillsOverflow);

		els.feed.addEventListener('click', (event) => {
			markCardReadFromEvent(event);
			const chip = event.target.closest('.chip[data-filter]');
			if (!chip) return;
			toggleFilter(chip.getAttribute('data-filter'), chip.getAttribute('data-value') || '');
		});

		els.feed.addEventListener('auxclick', (event) => {
			if (event.button === 1) markCardReadFromEvent(event);
		});

		state.dates = await listAvailableDates();
		state.dateSet = new Set(state.dates);
		if (!state.dates.length) {
			setStatus('Нет опубликованных дней в data/days', true);
			syncFilterUi();
			return;
		}

		const requested = queryDate();
		const initial = requested && state.dates.includes(requested) ? requested : state.dates[0];
		state.date = initial;
		setCalendarToDate(initial);
		syncFilterUi();
		await loadDay(initial);
	}

	init().catch((err) => {
		console.error(err);
		setStatus(err.message || String(err), true);
	});
})();
