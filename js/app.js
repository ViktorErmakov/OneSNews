(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const i18n = window.ONES_I18N;

	const state = {
		currentDay: null,
		dates: [],
		datesByLanguage: {},
		dateSet: new Set(),
		date: null,
		calendar: { year: 2026, month: 0 },
		source: '',
		language: (i18n && i18n.locale) || 'ru',
		query: '',
		searchHistory: [],
		readMap: {},
	};

	const READ_KEY = 'ones-read';
	const READ_MAX = 500;
	const READ_TTL_MS = 90 * 24 * 60 * 60 * 1000;
	const SEARCH_HISTORY_KEY = 'ones-search-history';
	const SEARCH_HISTORY_MAX = 8;

	const els = {
		datePicker: document.querySelector('#date-picker'),
		dateBtn: document.querySelector('#date-picker-btn'),
		datePanel: document.querySelector('#date-picker-panel'),
		langPicker: document.querySelector('#lang-picker'),
		langBtn: document.querySelector('#lang-picker-btn'),
		langList: document.querySelector('#lang-picker-list'),
		sourcePicker: document.querySelector('#source-picker'),
		sourceBtn: document.querySelector('#source-picker-btn'),
		sourceList: document.querySelector('#source-picker-list'),
		dayTitle: document.querySelector('#day-title'),
		dayCount: document.querySelector('#day-count'),
		sectionNav: document.querySelector('#section-nav'),
		feed: document.querySelector('#feed'),
		status: document.querySelector('#status'),
		chrome: document.querySelector('.chrome'),
		searchBox: document.querySelector('#search-box'),
		searchInput: document.querySelector('#feed-search'),
		searchClear: document.querySelector('#search-clear'),
		searchHistory: document.querySelector('#search-history'),
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

	const OLD_DIRECTION_CODES = new Set([
		'development',
		'analytics',
		'management',
		'releases',
		'devops',
		'community',
	]);
	const TAG_SVG =
		'<svg class="picker-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<path d="M20.5 13.2 L11 3.7H4.8v6.2l9.5 9.5 6.2-6.2z"/>' +
		'<circle cx="8.2" cy="8.2" r="1.35"/>' +
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
		return i18n ? i18n.flagSvg(code) : GLOBE_SVG;
	}

	function t(key, vars) {
		return i18n ? i18n.t(key, vars) : key;
	}

	function sourceTypes() {
		return (cfg.SOURCE_TYPES || []).map((section) => ({
			code: section.code,
			label: i18n ? i18n.sourceTypeLabel(section.code) : section.label || section.code,
		}));
	}

	function localeCode() {
		return (i18n && i18n.locale) || 'ru';
	}

	function allDayItems() {
		return state.currentDay?.items || [];
	}

	function hiddenSourceNames() {
		return window.ONES_PREFS ? window.ONES_PREFS.loadHidden() : new Set();
	}

	function hiddenTypeCodes() {
		return window.ONES_PREFS ? window.ONES_PREFS.loadHiddenTypes() : new Set();
	}

	function hiddenLanguageCodes() {
		if (!window.ONES_PREFS) return new Set();
		const codes = (cfg.LANGUAGES || []).map((lang) => lang.code);
		return window.ONES_PREFS.ensureHiddenLanguages(state.language || (i18n && i18n.locale) || 'ru', codes);
	}

	function dayItems() {
		const hidden = hiddenSourceNames();
		const hiddenTypes = hiddenTypeCodes();
		const hiddenLangs = hiddenLanguageCodes();
		return allDayItems().filter((item) => {
			const name = String(item.source_name || '').trim();
			const type = String(item.source_type || 'other').trim();
			const language = String(item.language || '').trim();
			if (hiddenLangs.has(language)) return false;
			if (hiddenTypes.has(type)) return false;
			return !hidden.has(name);
		});
	}

	function itemsOfCurrentLanguage() {
		return allDayItems().filter((item) => item.language === state.language);
	}

	function allSourcesHidden() {
		return itemsOfCurrentLanguage().length > 0 && itemsForSources().length === 0;
	}

	function availableLanguages() {
		return cfg.LANGUAGES.slice();
	}

	function itemsForSources() {
		const items = dayItems();
		if (!state.language) return items;
		return items.filter((item) => item.language === state.language);
	}

	function availableSources() {
		const counts = new Map();
		for (const item of itemsForSources()) {
			const name = String(item.source_name || '').trim();
			if (!name) continue;
			counts.set(name, (counts.get(name) || 0) + 1);
		}
		return [...counts.entries()]
			.sort((a, b) => a[0].localeCompare(b[0], localeCode(), { sensitivity: 'base' }))
			.map(([name, count]) => ({ code: name, label: name, count }));
	}

	function itemTopics(item) {
		const source = String(item.source_name || '').trim();
		const sourceKey = source.toLocaleLowerCase(localeCode());
		const raw = Array.isArray(item.topics) && item.topics.length ? item.topics : item.tags;
		if (!Array.isArray(raw) || !raw.length) return [];
		const out = [];
		const seen = new Set();
		for (const value of raw) {
			let label = String(value || '').trim();
			if (!label) continue;
			if (/^habr:\s*/i.test(label)) label = label.replace(/^habr:\s*/i, '').trim();
			if (!label) continue;
			const key = label.toLocaleLowerCase(localeCode());
			if (key === sourceKey || OLD_DIRECTION_CODES.has(key) || seen.has(key)) continue;
			seen.add(key);
			out.push(label);
		}
		return out;
	}

	function languagePickerOptions() {
		return availableLanguages();
	}

	function currentLanguageOption() {
		const options = languagePickerOptions();
		return (
			options.find((opt) => opt.code === state.language) ||
			options[0] || { code: 'ru', label: 'Русский' }
		);
	}

	function sourcePickerOptions() {
		const available = availableSources();
		if (available.length > 1) {
			const total = available.reduce((sum, opt) => sum + opt.count, 0);
			return [{ code: '', label: t('sourceAll'), count: total }].concat(available);
		}
		return available;
	}

	function currentSourceOption() {
		const options = sourcePickerOptions();
		return options.find((opt) => opt.code === state.source) || options[0] || { code: '', label: t('sourceAll') };
	}

	function syncSourceToAvailable() {
		const available = availableSources();
		if (available.length === 1) {
			state.source = available[0].code;
			return;
		}
		if (state.source && !available.some((d) => d.code === state.source)) {
			state.source = '';
		}
	}

	function syncFiltersToDay() {
		syncSourceToAvailable();
	}

	function emptyFeedMessage() {
		if (!allDayItems().length || !itemsOfCurrentLanguage().length) return t('empty.noItems');
		if (!itemsForSources().length) return t('empty.hidden');
		const afterFilters = itemsAfterFilters();
		if (!afterFilters.length) return t('empty.filters');
		if (state.query.trim()) {
			return t('empty.query', { query: state.query.trim() });
		}
		return t('empty.filters');
	}

	function emptyFeedHint() {
		if (!allDayItems().length || !itemsOfCurrentLanguage().length) return t('empty.noItemsHint');
		if (!itemsForSources().length) return '';
		const afterFilters = itemsAfterFilters();
		if (!afterFilters.length) return t('empty.filtersHint');
		if (state.query.trim()) return t('empty.queryHint');
		return t('empty.filtersHint');
	}

	function materialsLabel(count) {
		return i18n ? i18n.materialsLabel(count) : String(count);
	}

	function renderEmpty() {
		const hint = allSourcesHidden()
			? t('empty.hiddenHint')
			: escapeHtml(emptyFeedHint());
		return (
			`<p class="empty">` +
			`<span class="empty-lead">${escapeHtml(emptyFeedMessage())}</span>` +
			`<span class="empty-hint">${hint}</span>` +
			`</p>`
		);
	}

	function visibleSections(items) {
		return sourceTypes().filter((section) => items.some((item) => item.source_type === section.code));
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
		els.dayTitle.textContent =
			(state.currentDay && state.currentDay.date && i18n
				? i18n.formatDayTitle(state.currentDay.date)
				: '') ||
			(state.currentDay && state.currentDay.title) ||
			(state.currentDay && state.currentDay.date) ||
			'';
		if (els.dayCount) {
			els.dayCount.hidden = false;
			els.dayCount.textContent = materialsLabel(itemCount);
		}
		renderSectionNav(sections, counts);
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

	function unmarkRead(id) {
		if (!id || !isRead(id)) return false;
		delete state.readMap[id];
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

	function unmarkCardFromEvent(event) {
		const badge = event.target.closest && event.target.closest('.read-badge');
		if (!badge || !els.feed.contains(badge)) return false;
		const card = badge.closest('.card');
		const id = card && card.getAttribute('data-id');
		if (!id) return false;
		unmarkRead(id);
		if (card) card.classList.remove('is-read');
		return true;
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

	function queryLang() {
		const params = new URLSearchParams(window.location.search);
		const value = params.get('lang');
		return value === 'ru' || value === 'en' ? value : '';
	}

	function setUrlState() {
		const url = new URL(window.location.href);
		if (state.date) url.searchParams.set('date', state.date);
		else url.searchParams.delete('date');
		if (state.language) url.searchParams.set('lang', state.language);
		else url.searchParams.delete('lang');
		window.history.replaceState({}, '', url);
	}

	function parseIsoDate(iso) {
		if (i18n && i18n.parseIsoDate) return i18n.parseIsoDate(iso);
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
		if (!match) return null;
		return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
	}

	function formatDateLabel(iso) {
		return i18n ? i18n.formatDateLabel(iso) : iso || t('date');
	}

	function formatDateNumeric(iso) {
		return i18n ? i18n.formatDateNumeric(iso) : iso || t('date');
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

	function itemsAfterFilters() {
		return dayItems().filter((item) => {
			if (state.source && item.source_name !== state.source) return false;
			if (state.language && item.language !== state.language) return false;
			return true;
		});
	}

	function searchTerms() {
		return String(state.query || '')
			.trim()
			.toLowerCase()
			.split(/\s+/)
			.filter(Boolean);
	}

	function itemMatchesQuery(item, terms) {
		if (!terms.length) return true;
		const hay = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
		return terms.every((term) => hay.includes(term));
	}

	function filteredItems() {
		const terms = searchTerms();
		return itemsAfterFilters().filter((item) => itemMatchesQuery(item, terms));
	}

	function escapeRegExp(value) {
		return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}

	function highlightText(text, terms) {
		const escaped = escapeHtml(text);
		if (!terms.length) return escaped;
		const pattern = terms.map(escapeRegExp).join('|');
		if (!pattern) return escaped;
		try {
			return escaped.replace(new RegExp(`(${pattern})`, 'gi'), '<mark>$1</mark>');
		} catch (err) {
			return escaped;
		}
	}

	function optionMarkup(value, iconHtml, label, selected, count) {
		const countHtml =
			count == null
				? ''
				: `<span class="picker-count">${escapeHtml(String(count))}</span>`;
		return (
			`<li role="option" tabindex="-1" data-value="${escapeHtml(value)}" ` +
			`aria-selected="${selected}" class="${selected ? 'is-active' : ''}">` +
			iconHtml +
			`<span class="picker-option-label">${escapeHtml(label)}</span>` +
			countHtml +
			`</li>`
		);
	}

	function renderPickerButton(btn, ariaPrefix, iconHtml, visualLabel, spokenLabel, hideLabel) {
		const spoken = spokenLabel || visualLabel;
		const labelHtml = hideLabel
			? ''
			: `<span class="picker-btn-label">${escapeHtml(visualLabel)}</span>`;
		btn.innerHTML = iconHtml + labelHtml + CARET_SVG;
		btn.setAttribute('aria-label', ariaPrefix + ': ' + spoken);
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
		if (els.sourceBtn && els.sourceList) closePicker(els.sourceBtn, els.sourceList);
		rememberSearch(state.query);
		closeSearchHistory();
	}

	function closeFilterPickers() {
		closePicker(els.dateBtn, els.datePanel);
		closePicker(els.langBtn, els.langList);
		if (els.sourceBtn && els.sourceList) closePicker(els.sourceBtn, els.sourceList);
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
		renderPickerButton(
			els.dateBtn,
			t('date'),
			CALENDAR_SVG,
			formatDateNumeric(current),
			formatDateLabel(current),
		);

		const bounds = calendarBounds();
		const idx = monthIndex(state.calendar.year, state.calendar.month);
		const canPrev = bounds ? idx > bounds.min : false;
		const canNext = bounds ? idx < bounds.max : false;
		const title = i18n
			? i18n.monthTitle(state.calendar.year, state.calendar.month)
			: `${state.calendar.month + 1} ${state.calendar.year}`;
		const weekdayLabels = i18n ? i18n.weekdays() : [];

		els.datePanel.innerHTML =
			`<div class="calendar-head">` +
			`<button type="button" class="calendar-nav" data-cal="prev" aria-label="${escapeHtml(t('calendarPrev'))}"${canPrev ? '' : ' disabled'}>‹</button>` +
			`<div class="calendar-title">${escapeHtml(title)}</div>` +
			`<button type="button" class="calendar-nav" data-cal="next" aria-label="${escapeHtml(t('calendarNext'))}"${canNext ? '' : ' disabled'}>›</button>` +
			`</div>` +
			`<div class="calendar-weekdays">${weekdayLabels.map((d) => `<span>${d}</span>`).join('')}</div>` +
			`<div class="calendar-grid">${renderCalendarGrid()}</div>`;
	}

	function renderLangPicker() {
		if (!els.langPicker) return;
		const options = languagePickerOptions();
		if (!options.length) {
			els.langPicker.hidden = true;
			if (els.langList) els.langList.innerHTML = '';
			return;
		}
		els.langPicker.hidden = false;
		const current = currentLanguageOption();
		renderPickerButton(els.langBtn, t('language'), flagSvg(current.code), current.label, current.label, true);
		els.langList.innerHTML = options
			.map((opt) => optionMarkup(opt.code, flagSvg(opt.code), opt.label, opt.code === state.language))
			.join('');
	}

	function renderSourcePicker() {
		if (!els.sourcePicker) return;
		const options = sourcePickerOptions();
		if (!options.length) {
			els.sourcePicker.hidden = true;
			if (els.sourceList) els.sourceList.innerHTML = '';
			return;
		}

		els.sourcePicker.hidden = false;
		const current = currentSourceOption();
		renderPickerButton(els.sourceBtn, t('source'), TAG_SVG, current.label, current.label);
		els.sourceList.innerHTML = options
			.map((opt) =>
				optionMarkup(opt.code, '', opt.label, opt.code === state.source, opt.count)
			)
			.join('');
	}

	function syncFilterUi() {
		renderDatePicker();
		renderLangPicker();
		renderSourcePicker();
	}

	function setSource(code) {
		const available = availableSources();
		if (available.length === 1) {
			state.source = available[0].code;
		} else {
			state.source = code;
		}
		if (els.sourceBtn && els.sourceList) closePicker(els.sourceBtn, els.sourceList);
		renderSourcePicker();
		renderFeed();
	}

	function uniqueDates(dates) {
		return Array.from(new Set((dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))));
	}

	function applyLanguageDates() {
		const byLang = state.datesByLanguage[state.language];
		state.dates = Array.isArray(byLang) ? uniqueDates(byLang) : [];
		state.dateSet = new Set(state.dates);
	}

	function setLanguage(code) {
		const next = availableLanguages().some((lang) => lang.code === code) ? code : 'ru';
		state.language = next;
		if (window.ONES_PREFS) window.ONES_PREFS.revealLanguage(next);
		if (i18n) i18n.setLocale(next);
		applyLanguageDates();
		closePicker(els.langBtn, els.langList);
		const keepDate = state.date && state.dates.includes(state.date);
		const nextDate = keepDate ? state.date : state.dates[0] || null;
		if (!nextDate) {
			state.currentDay = null;
			state.date = null;
			setUrlState();
			syncFilterUi();
			setStatus(t('status.noDates'), true);
			renderFeed();
			return;
		}
		if (nextDate === state.date && state.currentDay) {
			syncSourceToAvailable();
			setUrlState();
			syncFilterUi();
			renderFeed();
			return;
		}
		loadDay(nextDate).catch((err) => {
			setStatus(err.message || String(err), true);
		});
	}

	function toggleFilter(kind, code) {
		if (kind === 'source') {
			const available = availableSources();
			if (available.length === 1) {
				setSource(available[0].code);
				return;
			}
			setSource(state.source === code ? '' : code);
		}
	}

	function renderCard(item) {
		const showSourceChip = !state.source && availableSources().length > 1;
		const read = isRead(item.id);
		const terms = searchTerms();
		const titleHtml = highlightText(item.title, terms);
		const summaryHtml = highlightText(item.summary, terms);
		const sourceName = String(item.source_name || '').trim() || t('source');
		const sourceChip = showSourceChip
			? `<button type="button" class="chip" data-filter="source" ` +
				`data-value="${escapeHtml(sourceName)}" aria-pressed="false" ` +
				`title="${escapeHtml(t('filterSource', { name: sourceName }))}" ` +
				`aria-label="${escapeHtml(t('filterSource', { name: sourceName }))}">${escapeHtml(sourceName)}</button>`
			: '';
		const author = String(item.author || '').trim();
		const showAuthor =
			Boolean(author) &&
			author !== 'Не указан' &&
			author.toLocaleLowerCase(localeCode()) !== sourceName.toLocaleLowerCase(localeCode());
		const authorHtml = showAuthor ? `<span>${escapeHtml(author)}</span>` : '';
		const topics = itemTopics(item);
		const topicsHtml = topics.length
			? `<span class="card-topics">${topics.map((topic) => escapeHtml(topic)).join(' · ')}</span>`
			: '';
		const summaryBlock = String(item.summary || '').trim()
			? `<p class="card-summary">${summaryHtml}</p>`
			: '';
		return (
			`<article class="card${read ? ' is-read' : ''}" data-id="${escapeHtml(item.id)}">` +
			`<h3 class="card-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" ` +
			`aria-label="${escapeHtml(t('opensNewTab', { title: item.title }))}">${titleHtml}${EXTERNAL_SVG}</a></h3>` +
			summaryBlock +
			`<div class="card-meta">` +
			sourceChip +
			authorHtml +
			topicsHtml +
			`<button type="button" class="read-badge" ` +
			`aria-label="${escapeHtml(t('unmarkRead'))}">` +
			`<span class="read-badge-state">${escapeHtml(t('read'))}</span>` +
			`<span class="read-badge-undo" aria-hidden="true">${escapeHtml(t('readUndo'))}</span>` +
			`</button>` +
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
		sourceTypes().forEach((section) => {
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

	async function listAvailableIndex() {
		const indexRes = await fetch('data/index.json', { cache: 'no-store' });
		if (!indexRes.ok) throw new Error(t('status.indexFail'));
		const data = await indexRes.json();
		const byLanguage = {};
		const raw = data.dates_by_language;
		if (raw && typeof raw === 'object') {
			Object.keys(raw).forEach((code) => {
				byLanguage[code] = uniqueDates(raw[code]);
			});
		}
		return { byLanguage };
	}

	async function loadDay(date) {
		setStatus(t('loading'));
		const res = await fetch(`data/days/${date}.json`, { cache: 'no-store' });
		if (!res.ok) throw new Error(t('status.dayFail', { date: date }));
		const day = await res.json();
		state.currentDay = day;
		state.date = date;
		rememberSearch(state.query);
		state.query = '';
		syncSearchInput();
		closeSearchHistory();
		setCalendarToDate(date);
		setUrlState();
		syncFiltersToDay();
		renderDatePicker();
		renderLangPicker();
		renderSourcePicker();
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

	function bindListPicker(btn, list, onSelect) {
		if (!btn || !list) return;

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

	function loadSearchHistory() {
		try {
			const parsed = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
			if (Array.isArray(parsed)) {
				state.searchHistory = parsed
					.filter((item) => typeof item === 'string' && item.trim())
					.map((item) => item.trim())
					.slice(0, SEARCH_HISTORY_MAX);
				return;
			}
		} catch (err) {
			/* ignore quota / private mode */
		}
		state.searchHistory = [];
	}

	function saveSearchHistory() {
		try {
			localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(state.searchHistory));
		} catch (err) {
			/* ignore quota / private mode */
		}
	}

	function rememberSearch(query) {
		const value = String(query || '').trim();
		if (!value) return;
		const lower = value.toLowerCase();
		state.searchHistory = [value]
			.concat(state.searchHistory.filter((item) => item.toLowerCase() !== lower))
			.slice(0, SEARCH_HISTORY_MAX);
		saveSearchHistory();
	}

	function removeSearchHistory(query) {
		state.searchHistory = state.searchHistory.filter((item) => item !== query);
		saveSearchHistory();
		if (isSearchHistoryOpen()) renderSearchHistory();
	}

	function matchingHistory() {
		const q = String(els.searchInput ? els.searchInput.value : state.query)
			.trim()
			.toLowerCase();
		if (!q) return state.searchHistory.slice();
		return state.searchHistory.filter((item) => item.toLowerCase().includes(q));
	}

	function isSearchHistoryOpen() {
		return Boolean(els.searchHistory && !els.searchHistory.hidden);
	}

	function closeSearchHistory() {
		if (!els.searchHistory) return;
		els.searchHistory.hidden = true;
		els.searchHistory.innerHTML = '';
		if (els.searchInput) els.searchInput.setAttribute('aria-expanded', 'false');
	}

	function openSearchHistory() {
		if (!els.searchHistory || !els.searchInput) return;
		closeFilterPickers();
		const items = matchingHistory();
		if (!items.length) {
			closeSearchHistory();
			return;
		}
		els.searchHistory.hidden = false;
		els.searchInput.setAttribute('aria-expanded', 'true');
		renderSearchHistory();
	}

	function renderSearchHistory() {
		if (!els.searchHistory || els.searchHistory.hidden) return;
		const items = matchingHistory();
		if (!items.length) {
			closeSearchHistory();
			return;
		}
		els.searchHistory.innerHTML = items
			.map((query, index) => {
				return (
					`<li role="option" tabindex="-1" data-query="${escapeHtml(query)}" ` +
					`class="search-history-item${index === 0 ? ' is-active' : ''}">` +
					`<span class="search-history-query">${escapeHtml(query)}</span>` +
					`<button type="button" class="search-history-remove" tabindex="-1" data-remove="${escapeHtml(query)}" ` +
					`aria-label="${escapeHtml(t('search.remove', { query }))}">×</button>` +
					`</li>`
				);
			})
			.join('');
	}

	function syncSearchClear() {
		if (!els.searchClear) return;
		els.searchClear.hidden = !String(state.query || '').trim();
	}

	function syncSearchInput() {
		if (els.searchInput && els.searchInput.value !== state.query) {
			els.searchInput.value = state.query;
		}
		syncSearchClear();
	}

	function applyQuery(value, options) {
		const next = String(value || '');
		state.query = next;
		syncSearchInput();
		if (options && options.save) rememberSearch(next);
		renderFeed();
	}

	function selectHistoryQuery(query) {
		applyQuery(query, { save: true });
		closeSearchHistory();
		if (els.searchInput) els.searchInput.focus();
	}

	function clearSearch(reopen) {
		rememberSearch(state.query);
		applyQuery('');
		if (els.searchInput) els.searchInput.focus();
		if (reopen) openSearchHistory();
		else closeSearchHistory();
	}

	function bindSearch() {
		if (!els.searchInput || !els.searchBox) return;

		els.searchInput.addEventListener('focus', () => {
			openSearchHistory();
		});

		els.searchInput.addEventListener('input', () => {
			state.query = els.searchInput.value;
			syncSearchClear();
			renderFeed();
			openSearchHistory();
		});

		els.searchInput.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				event.preventDefault();
				if (isSearchHistoryOpen()) {
					closeSearchHistory();
					return;
				}
				if (state.query) clearSearch(false);
				return;
			}
			if (event.key === 'ArrowDown') {
				const options = matchingHistory();
				if (!options.length) return;
				event.preventDefault();
				openSearchHistory();
				const first = els.searchHistory.querySelector('[role="option"]');
				if (first) first.focus();
				return;
			}
			if (event.key === 'Enter') {
				event.preventDefault();
				rememberSearch(state.query);
				closeSearchHistory();
				els.searchInput.blur();
			}
		});

		els.searchInput.addEventListener('blur', () => {
			const pending = state.query;
			window.setTimeout(() => {
				if (!els.searchBox.contains(document.activeElement)) {
					rememberSearch(pending);
					closeSearchHistory();
				}
			}, 0);
		});

		if (els.searchClear) {
			const onClearSearch = (event) => {
				event.preventDefault();
				event.stopPropagation();
				clearSearch(true);
			};
			els.searchClear.addEventListener('pointerdown', onClearSearch);
			els.searchClear.addEventListener('click', onClearSearch);
		}

		const field = els.searchBox.querySelector('.search-field');
		if (field) {
			field.addEventListener('click', (event) => {
				if (event.target.closest('button, input')) return;
				els.searchInput.focus();
			});
		}

		els.searchHistory.addEventListener('mousedown', (event) => {
			event.preventDefault();
		});

		els.searchHistory.addEventListener('click', (event) => {
			event.stopPropagation();
			const remove = event.target.closest('[data-remove]');
			if (remove) {
				removeSearchHistory(remove.getAttribute('data-remove') || '');
				if (els.searchInput) els.searchInput.focus();
				return;
			}
			const option = optionFromTarget(event.target);
			if (!option) return;
			selectHistoryQuery(option.getAttribute('data-query') || '');
		});

		els.searchHistory.addEventListener('keydown', (event) => {
			const options = Array.from(els.searchHistory.querySelectorAll('[role="option"]'));
			const current = document.activeElement;
			const index = options.indexOf(current);

			if (event.key === 'Escape') {
				event.preventDefault();
				closeSearchHistory();
				els.searchInput.focus();
				return;
			}
			if (event.key === 'ArrowDown') {
				event.preventDefault();
				(options[Math.min(index + 1, options.length - 1)] || options[0]).focus();
				return;
			}
			if (event.key === 'ArrowUp') {
				event.preventDefault();
				if (index <= 0) {
					els.searchInput.focus();
					return;
				}
				options[index - 1].focus();
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				if (current && current.closest('[data-remove]')) return;
				event.preventDefault();
				const option = optionFromTarget(current);
				if (option) selectHistoryQuery(option.getAttribute('data-query') || '');
				return;
			}
			if (event.key === 'Delete' || event.key === 'Backspace') {
				event.preventDefault();
				const option = optionFromTarget(current);
				if (!option) return;
				removeSearchHistory(option.getAttribute('data-query') || '');
				if (isSearchHistoryOpen()) {
					const first = els.searchHistory.querySelector('[role="option"]');
					if (first) first.focus();
					else els.searchInput.focus();
				} else {
					els.searchInput.focus();
				}
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
		loadSearchHistory();
		bindChromeHeight();
		bindDatePicker();
		bindSearch();
		bindListPicker(els.langBtn, els.langList, setLanguage);
		bindListPicker(els.sourceBtn, els.sourceList, setSource);

		document.addEventListener('click', (event) => {
			const target = event.target;
			if (!(target instanceof Node) || !target.isConnected) return;
			if (!els.datePicker.contains(target)) closePicker(els.dateBtn, els.datePanel);
			if (!els.langPicker.contains(target)) closePicker(els.langBtn, els.langList);
			if (els.sourcePicker && !els.sourcePicker.contains(target)) closePicker(els.sourceBtn, els.sourceList);
			if (els.searchBox && !els.searchBox.contains(target)) {
				rememberSearch(state.query);
				closeSearchHistory();
			}
		});

		els.feed.addEventListener('click', (event) => {
			if (unmarkCardFromEvent(event)) return;
			markCardReadFromEvent(event);
			const chip = event.target.closest('.chip[data-filter]');
			if (!chip) return;
			toggleFilter(chip.getAttribute('data-filter'), chip.getAttribute('data-value') || '');
		});

		els.feed.addEventListener('auxclick', (event) => {
			if (event.button === 1) markCardReadFromEvent(event);
		});

		state.datesByLanguage = (await listAvailableIndex()).byLanguage;
		if (queryLang()) {
			state.language = queryLang();
			if (i18n) i18n.setLocale(state.language, { silent: true });
		} else if (i18n) {
			state.language = i18n.locale;
		}
		if (window.ONES_PREFS) {
			window.ONES_PREFS.ensureHiddenLanguages(
				state.language,
				(cfg.LANGUAGES || []).map((lang) => lang.code),
			);
		}
		applyLanguageDates();
		if (!state.dates.length) {
			setStatus(t('status.noDates'), true);
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
