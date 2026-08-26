/** Source catalog with show/hide checkboxes. */
(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const prefs = window.ONES_PREFS;
	const i18n = window.ONES_I18N;
	const root = document.querySelector('#sources');
	const showAllBtn = document.querySelector('#sources-show-all');
	if (!root || !cfg || !prefs) return;

	function t(key) {
		return i18n ? i18n.t(key) : key;
	}

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
			.map((code) => ({ code, label: i18n ? i18n.sourceTypeLabel(code) : code }));
		return known
			.map((type) => ({
				code: type.code,
				label: i18n ? i18n.sourceTypeLabel(type.code) : type.label || type.code,
			}))
			.concat(extra);
	}

	function languageCodes() {
		return (cfg.LANGUAGES || []).map((lang) => lang.code);
	}

	function currentLocale() {
		return (i18n && i18n.locale) || 'ru';
	}

	function nothingHidden() {
		return (
			prefs.loadHidden().size === 0 &&
			prefs.loadHiddenTypes().size === 0 &&
			prefs.loadHiddenLanguages().size === 0
		);
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
			const langOn = input.closest('.about-lang')?.querySelector('input[data-lang]')?.checked;
			input.disabled = !langOn || !typeOn;
		});
	}

	function syncLangUi(lang, langOn) {
		const langInput = root.querySelector('input[data-lang="' + lang + '"]');
		const scope = (langInput && langInput.closest('.about-lang')) || root;
		scope.querySelectorAll('input[data-type]').forEach((input) => {
			input.disabled = !langOn;
		});
		scope.querySelectorAll('input[data-source]').forEach((input) => {
			const type = input.getAttribute('data-source-type') || '';
			const typeOn = !prefs.loadHiddenTypes().has(type);
			input.disabled = !langOn || !typeOn;
		});
	}

	function render(sources) {
		if (!sources.length) {
			setMessage(t('page.sourcesEmpty'));
			return;
		}

		const hidden = prefs.loadHidden();
		const hiddenTypes = prefs.loadHiddenTypes();
		const hiddenLangs = prefs.ensureHiddenLanguages(currentLocale(), languageCodes());
		const parts = [];
		let index = 0;
		for (const lang of languageOrder(sources)) {
			const byLang = sources.filter((item) => item.language === lang.code);
			if (!byLang.length) continue;
			const langOn = !hiddenLangs.has(lang.code);
			const langId = `lang-group-${index}`;
			const langChecked = langOn ? ' checked' : '';
			parts.push('<section class="about-lang">');
			parts.push(
				`<h3 class="about-lang-title settings-lang">` +
					`<input type="checkbox" id="${langId}" data-lang="${escapeHtml(lang.code)}"${langChecked}>` +
					`<label for="${langId}">${escapeHtml(lang.label)}</label>` +
					`</h3>`,
			);
			for (const type of typesFor(byLang)) {
				const byType = byLang.filter((item) => (item.source_type || 'other') === type.code);
				if (!byType.length) continue;
				const typeId = `type-${index}`;
				const typeOn = !hiddenTypes.has(type.code);
				const typeChecked = typeOn ? ' checked' : '';
				const typeDisabled = langOn ? '' : ' disabled';
				parts.push(
					`<h4 class="about-type-title settings-type">` +
						`<input type="checkbox" id="${typeId}" data-type="${escapeHtml(type.code)}"${typeChecked}${typeDisabled}>` +
						`<label for="${typeId}">${escapeHtml(type.label)}</label>` +
						`</h4>`,
				);
				parts.push('<ul class="settings-source-list">');
				for (const src of byType) {
					const name = String(src.name || src.home || '').trim();
					const id = `source-${index}`;
					index += 1;
					const checked = hidden.has(name) ? '' : ' checked';
					const disabled = langOn && typeOn ? '' : ' disabled';
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
		const langInput = event.target.closest('input[type="checkbox"][data-lang]');
		if (langInput) {
			const lang = String(langInput.getAttribute('data-lang') || '').trim();
			if (!lang) return;
			const hiddenLangs = prefs.loadHiddenLanguages();
			if (langInput.checked) hiddenLangs.delete(lang);
			else hiddenLangs.add(lang);
			prefs.saveHiddenLanguages(hiddenLangs);
			syncLangUi(lang, langInput.checked);
			syncShowAll();
			return;
		}

		const typeInput = event.target.closest('input[type="checkbox"][data-type]');
		if (typeInput) {
			if (typeInput.disabled) return;
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
		prefs.saveHiddenLanguages([]);
		root.querySelectorAll('input[type="checkbox"][data-lang]').forEach((input) => {
			input.checked = true;
		});
		root.querySelectorAll('input[type="checkbox"][data-type]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		root.querySelectorAll('input[type="checkbox"][data-source]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		syncShowAll();
	}

	let catalog = [];

	async function load() {
		try {
			const res = await fetch('data/sources.json', { cache: 'no-store' });
			if (!res.ok) throw new Error(t('page.sourcesFail'));
			const data = await res.json();
			catalog = Array.isArray(data.sources) ? data.sources.filter((item) => item && item.home) : [];
			render(catalog);
		} catch (err) {
			setMessage(t('page.sourcesFail'), true);
		}
	}

	const CARET_SVG =
		'<svg class="picker-caret" viewBox="0 0 12 12" aria-hidden="true">' +
		'<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
		'</svg>';

	const langBtn = document.querySelector('#lang-picker-btn');
	const langList = document.querySelector('#lang-picker-list');

	function renderLangPicker() {
		if (!langBtn || !langList || !i18n) return;
		const current = (cfg.LANGUAGES || []).find((lang) => lang.code === i18n.locale) || cfg.LANGUAGES[0];
		langBtn.innerHTML = i18n.flagSvg(current.code) + CARET_SVG;
		langBtn.setAttribute('aria-label', t('language') + ': ' + current.label);
		langList.innerHTML = (cfg.LANGUAGES || [])
			.map((opt) => {
				const selected = opt.code === i18n.locale;
				return (
					`<li role="option" tabindex="-1" data-value="${escapeHtml(opt.code)}" ` +
					`aria-selected="${selected}" class="${selected ? 'is-active' : ''}">` +
					i18n.flagSvg(opt.code) +
					`<span class="picker-option-label">${escapeHtml(opt.label)}</span>` +
					`</li>`
				);
			})
			.join('');
	}

	function closeLangPicker() {
		if (!langBtn || !langList) return;
		langList.hidden = true;
		langBtn.setAttribute('aria-expanded', 'false');
	}

	function openLangPicker() {
		if (!langBtn || !langList) return;
		langList.hidden = false;
		langBtn.setAttribute('aria-expanded', 'true');
		const selected = langList.querySelector('[aria-selected="true"]') || langList.firstElementChild;
		if (selected) selected.focus();
	}

	function bindLangPicker() {
		if (!langBtn || !langList) return;
		renderLangPicker();
		langBtn.addEventListener('click', (event) => {
			event.stopPropagation();
			if (langList.hidden) openLangPicker();
			else closeLangPicker();
		});
		langList.addEventListener('click', (event) => {
			event.stopPropagation();
			const option = event.target.closest('[role="option"]');
			if (!option) return;
			i18n.setLocale(option.getAttribute('data-value') || 'ru');
			prefs.revealLanguage(i18n.locale);
			closeLangPicker();
		});
		langBtn.addEventListener('keydown', (event) => {
			if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				openLangPicker();
			}
		});
		langList.addEventListener('keydown', (event) => {
			const options = Array.from(langList.querySelectorAll('[role="option"]'));
			const current = document.activeElement;
			const index = options.indexOf(current);
			if (event.key === 'Escape') {
				event.preventDefault();
				closeLangPicker();
				langBtn.focus();
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
				const option = current && current.closest ? current.closest('[role="option"]') : null;
				if (option) {
					i18n.setLocale(option.getAttribute('data-value') || 'ru');
					prefs.revealLanguage(i18n.locale);
				}
				closeLangPicker();
				langBtn.focus();
			}
		});
		document.addEventListener('click', (event) => {
			if (!langList.contains(event.target) && event.target !== langBtn && !langBtn.contains(event.target)) {
				closeLangPicker();
			}
		});
	}

	root.addEventListener('change', onToggle);
	if (showAllBtn) showAllBtn.addEventListener('click', showAll);
	document.addEventListener('ones-locale', () => {
		prefs.revealLanguage(currentLocale());
		renderLangPicker();
		if (catalog.length) render(catalog);
	});
	bindLangPicker();
	load();
})();
