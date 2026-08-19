(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const state = {
		index: null,
		currentDay: null,
		date: null,
		direction: '',
		language: '',
	};

	const els = {
		dateSelect: document.querySelector('#date-select'),
		directionSelect: document.querySelector('#direction-select'),
		languageSelect: document.querySelector('#language-select'),
		dayTitle: document.querySelector('#day-title'),
		feed: document.querySelector('#feed'),
		status: document.querySelector('#status'),
	};

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

	function fillSelect(select, options, includeAllLabel) {
		select.innerHTML = '';
		if (includeAllLabel) {
			const all = document.createElement('option');
			all.value = '';
			all.textContent = includeAllLabel;
			select.appendChild(all);
		}
		options.forEach((opt) => {
			const el = document.createElement('option');
			el.value = opt.value;
			el.textContent = opt.label;
			select.appendChild(el);
		});
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

	function renderCard(item) {
		const direction = labelOf(cfg.DIRECTIONS, item.direction);
		const language = labelOf(cfg.LANGUAGES, item.language);
		return (
			`<article class="card">` +
			`<h3 class="card-title"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title)}</a></h3>` +
			`<p class="card-summary">${escapeHtml(item.summary)}</p>` +
			`<div class="card-meta">` +
			`<span>${escapeHtml(item.source_name)}</span>` +
			`<span>${escapeHtml(item.author || 'Не указан')}</span>` +
			`<span class="chip">${escapeHtml(direction)}</span>` +
			`<span class="chip">${escapeHtml(language)}</span>` +
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
		els.dateSelect.value = date;
		setUrlDate(date);
		setStatus('');
		renderFeed();
	}

	async function init() {
		fillSelect(
			els.directionSelect,
			cfg.DIRECTIONS.map((d) => ({ value: d.code, label: d.label })),
			'Все направления',
		);
		fillSelect(
			els.languageSelect,
			cfg.LANGUAGES.map((l) => ({ value: l.code, label: l.label })),
			'Все языки',
		);

		const indexRes = await fetch('data/index.json', { cache: 'no-store' });
		if (!indexRes.ok) throw new Error('Не удалось загрузить data/index.json');
		state.index = await indexRes.json();

		const dates = state.index.dates || [];
		if (!dates.length) {
			setStatus('Нет опубликованных дней в data/index.json', true);
			return;
		}

		fillSelect(
			els.dateSelect,
			dates.map((d) => ({ value: d, label: d })),
		);

		const requested = queryDate();
		const initial = requested && dates.includes(requested) ? requested : dates[0];

		els.dateSelect.addEventListener('change', async () => {
			state.direction = '';
			state.language = '';
			els.directionSelect.value = '';
			els.languageSelect.value = '';
			try {
				await loadDay(els.dateSelect.value);
			} catch (err) {
				setStatus(err.message || String(err), true);
			}
		});

		els.directionSelect.addEventListener('change', () => {
			state.direction = els.directionSelect.value;
			renderFeed();
		});

		els.languageSelect.addEventListener('change', () => {
			state.language = els.languageSelect.value;
			renderFeed();
		});

		await loadDay(initial);
	}

	init().catch((err) => {
		console.error(err);
		setStatus(err.message || String(err), true);
	});
})();
