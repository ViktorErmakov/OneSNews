(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const state = {
		index: null,
		currentDay: null,
		dates: [],
		date: null,
		direction: '',
		language: '',
	};

	const els = {
		datePicker: document.querySelector('#date-picker'),
		dateBtn: document.querySelector('#date-picker-btn'),
		dateList: document.querySelector('#date-picker-list'),
		langPicker: document.querySelector('#lang-picker'),
		langBtn: document.querySelector('#lang-picker-btn'),
		langList: document.querySelector('#lang-picker-list'),
		directionPills: document.querySelector('#direction-pills'),
		dayTitle: document.querySelector('#day-title'),
		feed: document.querySelector('#feed'),
		status: document.querySelector('#status'),
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

	function languageOptions() {
		return [{ code: '', label: 'Все языки' }].concat(cfg.LANGUAGES);
	}

	function currentLanguageOption() {
		return languageOptions().find((opt) => opt.code === state.language) || languageOptions()[0];
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

	function isPickerOpen(list) {
		return !list.hidden;
	}

	function closePicker(btn, list) {
		list.hidden = true;
		btn.setAttribute('aria-expanded', 'false');
	}

	function closeAllPickers() {
		closePicker(els.dateBtn, els.dateList);
		closePicker(els.langBtn, els.langList);
	}

	function openPicker(btn, list) {
		closeAllPickers();
		list.hidden = false;
		btn.setAttribute('aria-expanded', 'true');
		const selected = list.querySelector('[aria-selected="true"]') || list.firstElementChild;
		if (selected) selected.focus();
	}

	function togglePicker(btn, list) {
		if (isPickerOpen(list)) closePicker(btn, list);
		else openPicker(btn, list);
	}

	function renderDatePicker() {
		const current = state.date || (state.dates[0] || '');
		renderPickerButton(els.dateBtn, 'Дата', CALENDAR_SVG, current || 'Дата');
		els.dateList.innerHTML = state.dates
			.map((date) => optionMarkup(date, CALENDAR_SVG, date, date === current))
			.join('');
	}

	function renderLangPicker() {
		const current = currentLanguageOption();
		renderPickerButton(els.langBtn, 'Язык', flagSvg(current.code), current.label);
		els.langList.innerHTML = languageOptions()
			.map((opt) => optionMarkup(opt.code, flagSvg(opt.code), opt.label, opt.code === state.language))
			.join('');
	}

	function renderDirectionPills() {
		const pills = [{ code: '', label: 'Все' }].concat(cfg.DIRECTIONS);
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
	}

	function syncFilterUi() {
		renderDatePicker();
		renderLangPicker();
		renderDirectionPills();
	}

	function setDirection(code) {
		state.direction = code;
		renderDirectionPills();
		renderFeed();
	}

	function setLanguage(code) {
		state.language = code;
		closePicker(els.langBtn, els.langList);
		renderLangPicker();
		renderFeed();
	}

	function toggleFilter(kind, code) {
		if (kind === 'direction') {
			setDirection(state.direction === code ? '' : code);
			return;
		}
		if (kind === 'language') {
			setLanguage(state.language === code ? '' : code);
		}
	}

	function renderCard(item) {
		const direction = labelOf(cfg.DIRECTIONS, item.direction);
		const language = labelOf(cfg.LANGUAGES, item.language);
		const dirActive = state.direction === item.direction;
		const langActive = state.language === item.language;
		return (
			`<article class="card">` +
			`<h3 class="card-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>` +
			`<p class="card-summary">${escapeHtml(item.summary)}</p>` +
			`<div class="card-meta">` +
			`<span>${escapeHtml(item.source_name)}</span>` +
			`<span>${escapeHtml(item.author || 'Не указан')}</span>` +
			`<button type="button" class="chip${dirActive ? ' is-active' : ''}" data-filter="direction" data-value="${escapeHtml(item.direction)}">${escapeHtml(direction)}</button>` +
			`<button type="button" class="chip${langActive ? ' is-active' : ''}" data-filter="language" data-value="${escapeHtml(item.language)}">${escapeHtml(language)}</button>` +
			`</div>` +
			`</article>`
		);
	}

	function renderFeed() {
		if (!state.currentDay) {
			els.feed.innerHTML = '';
			return;
		}

		els.dayTitle.textContent = state.currentDay.title || state.currentDay.date;

		const items = filteredItems();
		if (!items.length) {
			els.feed.innerHTML = `<p class="empty">Нет новостей по выбранным фильтрам.</p>`;
			return;
		}

		const parts = [];
		cfg.SOURCE_TYPES.forEach((section) => {
			const sectionItems = items.filter((item) => item.source_type === section.code);
			if (!sectionItems.length) return;
			parts.push(`<section class="section">`);
			parts.push(`<h2 class="section-title">${escapeHtml(section.label)}</h2>`);
			parts.push(`<div class="cards">${sectionItems.map(renderCard).join('')}</div>`);
			parts.push(`</section>`);
		});

		els.feed.innerHTML = parts.join('') || `<p class="empty">Нет новостей по выбранным фильтрам.</p>`;
	}

	async function loadDay(date) {
		setStatus('Загрузка…');
		const res = await fetch(`data/days/${date}.json`, { cache: 'no-store' });
		if (!res.ok) throw new Error(`Не удалось загрузить день ${date}`);
		const day = await res.json();
		state.currentDay = day;
		state.date = date;
		setUrlDate(date);
		renderDatePicker();
		setStatus('');
		renderFeed();
	}

	async function changeDate(date) {
		if (!date || date === state.date) {
			closePicker(els.dateBtn, els.dateList);
			return;
		}
		state.direction = '';
		state.language = '';
		closeAllPickers();
		renderLangPicker();
		renderDirectionPills();
		try {
			await loadDay(date);
		} catch (err) {
			setStatus(err.message || String(err), true);
		}
	}

	function optionFromTarget(target) {
		return target && target.closest ? target.closest('[role="option"]') : null;
	}

	function bindPicker(btn, list, onSelect) {
		btn.addEventListener('click', (event) => {
			event.stopPropagation();
			togglePicker(btn, list);
		});

		list.addEventListener('click', (event) => {
			event.stopPropagation();
			const option = optionFromTarget(event.target);
			if (!option) return;
			onSelect(option.getAttribute('data-value') || '');
		});

		btn.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openPicker(btn, list);
			}
		});

		list.addEventListener('keydown', (event) => {
			const options = Array.from(list.querySelectorAll('[role="option"]'));
			const current = document.activeElement;
			const index = options.indexOf(current);

			if (event.key === 'Escape') {
				event.preventDefault();
				closePicker(btn, list);
				btn.focus();
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
				if (option) onSelect(option.getAttribute('data-value') || '');
				btn.focus();
			}
		});
	}

	async function init() {
		bindPicker(els.dateBtn, els.dateList, (value) => {
			changeDate(value);
		});
		bindPicker(els.langBtn, els.langList, (value) => {
			setLanguage(value);
		});

		document.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Node) || !target.isConnected) return;
			if (!els.datePicker.contains(target)) closePicker(els.dateBtn, els.dateList);
			if (!els.langPicker.contains(target)) closePicker(els.langBtn, els.langList);
		});

		els.directionPills.addEventListener('click', (event) => {
			const pill = event.target.closest('[data-direction]');
			if (!pill) return;
			setDirection(pill.getAttribute('data-direction') || '');
		});

		els.feed.addEventListener('click', (event) => {
			const chip = event.target.closest('.chip[data-filter]');
			if (!chip) return;
			toggleFilter(chip.getAttribute('data-filter'), chip.getAttribute('data-value') || '');
		});

		const indexRes = await fetch('data/index.json', { cache: 'no-store' });
		if (!indexRes.ok) throw new Error('Не удалось загрузить data/index.json');
		state.index = await indexRes.json();

		state.dates = state.index.dates || [];
		if (!state.dates.length) {
			setStatus('Нет опубликованных дней в data/index.json', true);
			syncFilterUi();
			return;
		}

		const requested = queryDate();
		const initial = requested && state.dates.includes(requested) ? requested : state.dates[0];
		state.date = initial;
		syncFilterUi();
		await loadDay(initial);
	}

	init().catch((err) => {
		console.error(err);
		setStatus(err.message || String(err), true);
	});
})();
