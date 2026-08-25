/** Source catalog with show/hide checkboxes. */
(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const prefs = window.ONES_PREFS;
	const root = document.querySelector('#sources');
	const showAllBtn = document.querySelector('#sources-show-all');
	if (!root || !cfg || !prefs) return;

	const EXTERNAL_SVG =
		'<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<path d="M14 5h5v5M19 5l-9 9M11 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V13"/>' +
		'</svg>';

	function escapeHtml(value) {
		return String(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function setMessage(text, isError) {
		root.innerHTML =
			`<p class="about-sources-status${isError ? ' is-error' : ''}">${escapeHtml(text)}</p>`;
		syncShowAll();
	}

	function languageOrder(sources) {
		const present = new Set(sources.map((item) => item.language));
		const known = cfg.LANGUAGES.filter((lang) => present.has(lang.code));
		const knownCodes = new Set(known.map((lang) => lang.code));
		const extra = [...present]
			.filter((code) => !knownCodes.has(code))
			.sort()
			.map((code) => ({ code, label: code }));
		return known.concat(extra);
	}

	function typesFor(items) {
		const present = new Set(items.map((item) => item.source_type || 'other'));
		const known = cfg.SOURCE_TYPES.filter((type) => present.has(type.code));
		const knownCodes = new Set(known.map((type) => type.code));
		const extra = [...present]
			.filter((code) => !knownCodes.has(code))
			.sort()
			.map((code) => ({ code, label: code }));
		return known.concat(extra);
	}

	function nothingHidden() {
		return prefs.loadHidden().size === 0 && prefs.loadHiddenTypes().size === 0;
	}

	function syncShowAll() {
		if (!showAllBtn) return;
		showAllBtn.disabled = nothingHidden();
	}

	function syncTypeUi(type, typeOn) {
		root.querySelectorAll('input[data-type="' + type + '"]').forEach((input) => {
			input.checked = typeOn;
		});
		root.querySelectorAll('input[data-source-type="' + type + '"]').forEach((input) => {
			input.disabled = !typeOn;
		});
	}

	function render(sources) {
		if (!sources.length) {
			setMessage('Пока нет включённых источников.');
			return;
		}

		const hidden = prefs.loadHidden();
		const hiddenTypes = prefs.loadHiddenTypes();
		const parts = [];
		let index = 0;
		for (const lang of languageOrder(sources)) {
			const byLang = sources.filter((item) => item.language === lang.code);
			if (!byLang.length) continue;
			parts.push('<section class="about-lang">');
			parts.push(`<h3 class="about-lang-title">${escapeHtml(lang.label)}</h3>`);
			for (const type of typesFor(byLang)) {
				const byType = byLang.filter((item) => (item.source_type || 'other') === type.code);
				if (!byType.length) continue;
				const typeId = `type-${index}`;
				const typeOn = !hiddenTypes.has(type.code);
				const typeChecked = typeOn ? ' checked' : '';
				parts.push(
					`<h4 class="about-type-title settings-type">` +
						`<input type="checkbox" id="${typeId}" data-type="${escapeHtml(type.code)}"${typeChecked}>` +
						`<label for="${typeId}">${escapeHtml(type.label)}</label>` +
						`</h4>`,
				);
				parts.push('<ul class="settings-source-list">');
				for (const src of byType) {
					const name = String(src.name || src.home || '').trim();
					const id = `source-${index}`;
					index += 1;
					const checked = hidden.has(name) ? '' : ' checked';
					const disabled = typeOn ? '' : ' disabled';
					parts.push(
						'<li class="settings-source">' +
							`<input type="checkbox" id="${id}" data-source="${escapeHtml(name)}" ` +
							`data-source-type="${escapeHtml(type.code)}"${checked}${disabled} ` +
							`aria-labelledby="${id}-name">` +
							`<a id="${id}-name" href="${escapeHtml(src.home)}" target="_blank" rel="noopener noreferrer">` +
							`${escapeHtml(name || src.home)}${EXTERNAL_SVG}</a>` +
							'</li>',
					);
				}
				parts.push('</ul>');
			}
			parts.push('</section>');
		}
		root.innerHTML = parts.join('');
		syncShowAll();
	}

	function onToggle(event) {
		const typeInput = event.target.closest('input[type="checkbox"][data-type]');
		if (typeInput) {
			const type = String(typeInput.getAttribute('data-type') || '').trim();
			if (!type) return;
			const hiddenTypes = prefs.loadHiddenTypes();
			if (typeInput.checked) hiddenTypes.delete(type);
			else hiddenTypes.add(type);
			prefs.saveHiddenTypes(hiddenTypes);
			syncTypeUi(type, typeInput.checked);
			syncShowAll();
			return;
		}

		const input = event.target.closest('input[type="checkbox"][data-source]');
		if (!input || input.disabled) return;
		const name = String(input.getAttribute('data-source') || '').trim();
		if (!name) return;
		const hidden = prefs.loadHidden();
		if (input.checked) hidden.delete(name);
		else hidden.add(name);
		prefs.saveHidden(hidden);
		syncShowAll();
	}

	function showAll() {
		prefs.saveHidden([]);
		prefs.saveHiddenTypes([]);
		root.querySelectorAll('input[type="checkbox"][data-type]').forEach((input) => {
			input.checked = true;
		});
		root.querySelectorAll('input[type="checkbox"][data-source]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		syncShowAll();
	}

	async function load() {
		try {
			const res = await fetch('data/sources.json', { cache: 'no-store' });
			if (!res.ok) throw new Error('Не удалось загрузить список источников');
			const data = await res.json();
			const sources = Array.isArray(data.sources) ? data.sources : [];
			render(sources.filter((item) => item && item.home));
		} catch (err) {
			setMessage('Не удалось загрузить список источников.', true);
		}
	}

	root.addEventListener('change', onToggle);
	if (showAllBtn) showAllBtn.addEventListener('click', showAll);
	load();
})();
