/** Source catalog with show/hide checkboxes and card order. */
(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const prefs = window.ONES_PREFS;
	const i18n = window.ONES_I18N;
	const root = document.querySelector('#sources');
	const showAllBtn = document.querySelector('#sources-show-all');
	const resetOrderBtn = document.querySelector('#sources-reset-order');

	(function syncChannelLinks() {
		const url = (cfg && cfg.TELEGRAM_CHANNEL) || '';
		document.querySelectorAll('a.js-channel').forEach((link) => {
			if (!url) {
				link.hidden = true;
				return;
			}
			link.hidden = false;
			link.href = url;
		});
	})();

	if (!root || !cfg || !prefs) return;

	function t(key, vars) {
		return i18n ? i18n.t(key, vars) : key;
	}

	const EXTERNAL_SVG =
		'<svg class="external-icon" viewBox="0 0 24 24" aria-hidden="true">' +
		'<path d="M14 5h5v5M19 5l-9 9M11 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V13"/>' +
		'</svg>';

	const MOVE_UP_SVG =
		'<svg class="settings-move-icon" viewBox="0 0 12 12" aria-hidden="true">' +
		'<path d="M2.5 7.5 L6 4 L9.5 7.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
		'</svg>';

	const MOVE_DOWN_SVG =
		'<svg class="settings-move-icon" viewBox="0 0 12 12" aria-hidden="true">' +
		'<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
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
		syncResetOrder();
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
			prefs.loadHiddenGroups().size === 0 &&
			prefs.loadHiddenLanguages().size === 0
		);
	}

	function groupsFor(items) {
		const seen = [];
		const present = new Set();
		for (const item of items) {
			const group = String(item.group || '').trim();
			if (!group || present.has(group)) continue;
			present.add(group);
			seen.push(group);
		}
		return seen;
	}

	function langOnFor(input) {
		return Boolean(input.closest('.about-lang')?.querySelector('input[data-lang]')?.checked);
	}

	function sourceInputDisabled(input, langOn, typeOn) {
		const group = input.getAttribute('data-source-group') || '';
		const groupOn = !group || !prefs.loadHiddenGroups().has(group);
		return !langOn || !typeOn || !groupOn;
	}

	function publishCatalog(sources) {
		const groups = {};
		for (const src of sources) {
			const name = String(src.name || '').trim();
			const group = String(src.group || '').trim();
			if (name && group) groups[name] = group;
		}
		window.ONES_CATALOG = { sources: sources, groups: groups };
		document.dispatchEvent(new CustomEvent('ones-catalog'));
	}

	function syncShowAll() {
		if (!showAllBtn) return;
		showAllBtn.disabled = nothingHidden();
	}

	function sourceName(src) {
		return String((src && (src.name || src.home)) || '').trim();
	}

	function catalogNameList() {
		const seen = new Set();
		const names = [];
		for (const src of catalog) {
			const name = sourceName(src);
			if (!name || seen.has(name)) continue;
			seen.add(name);
			names.push(name);
		}
		return names;
	}

	function sortSources(items) {
		const order = prefs.orderedNames(catalogNameList());
		const rank = new Map(order.map((name, index) => [name, index]));
		const last = rank.size;
		return items.slice().sort((a, b) => {
			const ia = rank.has(sourceName(a)) ? rank.get(sourceName(a)) : last;
			const ib = rank.has(sourceName(b)) ? rank.get(sourceName(b)) : last;
			return ia - ib;
		});
	}

	function syncResetOrder() {
		if (!resetOrderBtn) return;
		const base = catalogNameList();
		const custom = Boolean(base.length && prefs.orderIsCustom(base));
		resetOrderBtn.disabled = !custom;
		if (base.length && !custom && prefs.loadSourceOrder().length) prefs.saveSourceOrder([]);
	}

	function syncTypeUi(type, typeOn) {
		root.querySelectorAll('input[data-type="' + type + '"]').forEach((input) => {
			input.checked = typeOn;
		});
		root.querySelectorAll('input[data-group-type="' + type + '"]').forEach((input) => {
			input.disabled = !langOnFor(input) || !typeOn;
		});
		root.querySelectorAll('input[data-source-type="' + type + '"]').forEach((input) => {
			input.disabled = sourceInputDisabled(input, langOnFor(input), typeOn);
		});
	}

	function syncGroupUi(group, groupOn) {
		root.querySelectorAll('input[data-group="' + group + '"]').forEach((input) => {
			input.checked = groupOn;
		});
		root.querySelectorAll('input[data-source-group="' + group + '"]').forEach((input) => {
			const type = input.getAttribute('data-source-type') || '';
			const typeOn = !prefs.loadHiddenTypes().has(type);
			input.disabled = sourceInputDisabled(input, langOnFor(input), typeOn);
		});
	}

	function syncLangUi(lang, langOn) {
		const langInput = root.querySelector('input[data-lang="' + lang + '"]');
		const scope = (langInput && langInput.closest('.about-lang')) || root;
		scope.querySelectorAll('input[data-type]').forEach((input) => {
			input.disabled = !langOn;
		});
		scope.querySelectorAll('input[data-group]').forEach((input) => {
			const type = input.getAttribute('data-group-type') || '';
			const typeOn = !prefs.loadHiddenTypes().has(type);
			input.disabled = !langOn || !typeOn;
		});
		scope.querySelectorAll('input[data-source]').forEach((input) => {
			const type = input.getAttribute('data-source-type') || '';
			const typeOn = !prefs.loadHiddenTypes().has(type);
			input.disabled = sourceInputDisabled(input, langOn, typeOn);
		});
	}

	function render(sources) {
		if (!sources.length) {
			setMessage(t('page.sourcesEmpty'));
			return;
		}

		const hidden = prefs.loadHidden();
		const hiddenTypes = prefs.loadHiddenTypes();
		const hiddenGroups = prefs.loadHiddenGroups();
		const hiddenLangs = prefs.ensureHiddenLanguages(currentLocale(), languageCodes());
		const parts = [];
		let index = 0;

		function pushSource(src, type, langOn, typeOn, position, count) {
			const name = sourceName(src);
			const group = String(src.group || '').trim();
			const id = `source-${index}`;
			index += 1;
			const checked = hidden.has(name) ? '' : ' checked';
			const groupOn = !group || !hiddenGroups.has(group);
			const disabled = langOn && typeOn && groupOn ? '' : ' disabled';
			const groupAttr = group ? ` data-source-group="${escapeHtml(group)}"` : '';
			const upDisabled = position === 0 ? ' disabled' : '';
			const downDisabled = position === count - 1 ? ' disabled' : '';
			parts.push(
				'<li class="settings-source">' +
					'<span class="settings-source-move">' +
					`<button type="button" class="settings-move" data-move="up" data-source-move="${escapeHtml(name)}" ` +
					`aria-label="${escapeHtml(t('page.moveUp', { name: name }))}"${upDisabled}>${MOVE_UP_SVG}</button>` +
					`<button type="button" class="settings-move" data-move="down" data-source-move="${escapeHtml(name)}" ` +
					`aria-label="${escapeHtml(t('page.moveDown', { name: name }))}"${downDisabled}>${MOVE_DOWN_SVG}</button>` +
					'</span>' +
					`<input type="checkbox" id="${id}" data-source="${escapeHtml(name)}" ` +
					`data-source-type="${escapeHtml(type)}"${groupAttr}${checked}${disabled} ` +
					`aria-labelledby="${id}-name">` +
					`<a id="${id}-name" href="${escapeHtml(src.home)}" target="_blank" rel="noopener noreferrer">` +
					`${escapeHtml(name || src.home)}${EXTERNAL_SVG}</a>` +
					'</li>',
			);
		}

		function pushSources(items, type, langOn, typeOn) {
			const ordered = sortSources(items);
			ordered.forEach((src, position) => {
				pushSource(src, type, langOn, typeOn, position, ordered.length);
			});
		}

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
			parts.push('<div class="settings-lang-body">');
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
				parts.push('<div class="settings-type-body">');
				const typeGroups = type.code === 'video' ? groupsFor(byType) : [];
				if (typeGroups.length) {
					const ungrouped = byType.filter((item) => !String(item.group || '').trim());
					for (const group of typeGroups) {
						const groupId = `group-${index}`;
						index += 1;
						const groupOn = !hiddenGroups.has(group);
						const groupChecked = groupOn ? ' checked' : '';
						const groupDisabled = langOn && typeOn ? '' : ' disabled';
						parts.push(
							`<h5 class="about-host-title settings-host">` +
								`<input type="checkbox" id="${groupId}" data-group="${escapeHtml(group)}" ` +
								`data-group-type="${escapeHtml(type.code)}"${groupChecked}${groupDisabled}>` +
								`<label for="${groupId}">${escapeHtml(group)}</label>` +
								`</h5>`,
						);
						parts.push('<ul class="settings-source-list settings-source-list-nested">');
						pushSources(
							byType.filter((item) => String(item.group || '').trim() === group),
							type.code,
							langOn,
							typeOn,
						);
						parts.push('</ul>');
					}
					if (ungrouped.length) {
						parts.push('<ul class="settings-source-list">');
						pushSources(ungrouped, type.code, langOn, typeOn);
						parts.push('</ul>');
					}
				} else {
					parts.push('<ul class="settings-source-list">');
					pushSources(byType, type.code, langOn, typeOn);
					parts.push('</ul>');
				}
				parts.push('</div>');
			}
			parts.push('</div>');
			parts.push('</section>');
		}
		root.innerHTML = parts.join('');
		syncShowAll();
		syncResetOrder();
	}

	function emitPrefs() {
		document.dispatchEvent(new CustomEvent('ones-prefs'));
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
			emitPrefs();
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
			emitPrefs();
			return;
		}

		const groupInput = event.target.closest('input[type="checkbox"][data-group]');
		if (groupInput) {
			if (groupInput.disabled) return;
			const group = String(groupInput.getAttribute('data-group') || '').trim();
			if (!group) return;
			const hiddenGroups = prefs.loadHiddenGroups();
			if (groupInput.checked) hiddenGroups.delete(group);
			else hiddenGroups.add(group);
			prefs.saveHiddenGroups(hiddenGroups);
			syncGroupUi(group, groupInput.checked);
			syncShowAll();
			emitPrefs();
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
		emitPrefs();
	}

	function showAll() {
		prefs.saveHidden([]);
		prefs.saveHiddenTypes([]);
		prefs.saveHiddenGroups([]);
		prefs.saveHiddenLanguages([]);
		root.querySelectorAll('input[type="checkbox"][data-lang]').forEach((input) => {
			input.checked = true;
		});
		root.querySelectorAll('input[type="checkbox"][data-type]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		root.querySelectorAll('input[type="checkbox"][data-group]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		root.querySelectorAll('input[type="checkbox"][data-source]').forEach((input) => {
			input.checked = true;
			input.disabled = false;
		});
		syncShowAll();
		emitPrefs();
	}

	function siblingNames(name) {
		const input = root.querySelector('input[data-source="' + CSS.escape(name) + '"]');
		const list = input && input.closest('.settings-source-list');
		if (!list) return [];
		return Array.from(list.querySelectorAll('input[data-source]'))
			.map((item) => String(item.getAttribute('data-source') || '').trim())
			.filter(Boolean);
	}

	function focusMoveButton(name, dir) {
		const button = root.querySelector(
			'button[data-move="' + dir + '"][data-source-move="' + CSS.escape(name) + '"]',
		);
		if (button && !button.disabled) {
			button.focus();
			return;
		}
		const other = dir === 'up' ? 'down' : 'up';
		const fallback = root.querySelector(
			'button[data-move="' + other + '"][data-source-move="' + CSS.escape(name) + '"]',
		);
		if (fallback && !fallback.disabled) fallback.focus();
	}

	function moveSource(name, dir) {
		const siblings = siblingNames(name);
		const index = siblings.indexOf(name);
		const nextIndex = index + (dir === 'up' ? -1 : 1);
		if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
		const nextSiblings = siblings.slice();
		const swapped = nextSiblings[index];
		nextSiblings[index] = nextSiblings[nextIndex];
		nextSiblings[nextIndex] = swapped;
		const siblingSet = new Set(siblings);
		let cursor = 0;
		const next = prefs.orderedNames(catalogNameList()).map((item) => {
			if (!siblingSet.has(item)) return item;
			const replacement = nextSiblings[cursor];
			cursor += 1;
			return replacement;
		});
		if (cursor < nextSiblings.length) next.push(...nextSiblings.slice(cursor));
		const base = catalogNameList();
		prefs.saveSourceOrder(next.length === base.length && next.every((item, i) => item === base[i]) ? [] : next);
		if (catalog.length) render(catalog);
		focusMoveButton(name, dir);
		emitPrefs();
	}

	function onMove(event) {
		const button = event.target.closest('button[data-move]');
		if (!button || button.disabled || !root.contains(button)) return;
		const dir = button.getAttribute('data-move');
		const name = String(button.getAttribute('data-source-move') || '').trim();
		if ((dir !== 'up' && dir !== 'down') || !name) return;
		moveSource(name, dir);
	}

	function resetOrder() {
		prefs.saveSourceOrder([]);
		if (catalog.length) render(catalog);
		else syncResetOrder();
		emitPrefs();
	}

	let catalog = [];

	async function load() {
		try {
			const res = await fetch('data/sources.json', { cache: 'no-store' });
			if (!res.ok) throw new Error(t('page.sourcesFail'));
			const data = await res.json();
			catalog = Array.isArray(data.sources) ? data.sources.filter((item) => item && item.home) : [];
			publishCatalog(catalog);
			render(catalog);
		} catch (err) {
			publishCatalog([]);
			setMessage(t('page.sourcesFail'), true);
		}
	}

	const CARET_SVG =
		'<svg class="picker-caret" viewBox="0 0 12 12" aria-hidden="true">' +
		'<path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
		'</svg>';

	const langBtn = document.querySelector('#lang-picker-btn');
	const langList = document.querySelector('#lang-picker-list');

	function feedShowsAll() {
		return Boolean(prefs && prefs.loadFeedLanguage && prefs.loadFeedLanguage() === 'all');
	}

	function renderLangPicker() {
		if (!langBtn || !langList || !i18n) return;
		const allSelected = feedShowsAll();
		const current = allSelected
			? { code: '', label: t('languageAll') }
			: (cfg.LANGUAGES || []).find((lang) => lang.code === i18n.locale) || cfg.LANGUAGES[0];
		langBtn.innerHTML = i18n.flagSvg(current.code) + CARET_SVG;
		langBtn.setAttribute('aria-label', t('language') + ': ' + current.label);
		const allOption =
			`<li role="option" tabindex="-1" data-value="" ` +
			`aria-selected="${allSelected}" class="${allSelected ? 'is-active' : ''}">` +
			i18n.flagSvg('') +
			`<span class="picker-option-label">${escapeHtml(t('languageAll'))}</span>` +
			`</li>`;
		const languageOptions = (cfg.LANGUAGES || [])
			.map((opt) => {
				const selected = !allSelected && opt.code === i18n.locale;
				return (
					`<li role="option" tabindex="-1" data-value="${escapeHtml(opt.code)}" ` +
					`aria-selected="${selected}" class="${selected ? 'is-active' : ''}">` +
					i18n.flagSvg(opt.code) +
					`<span class="picker-option-label">${escapeHtml(opt.label)}</span>` +
					`</li>`
				);
			})
			.join('');
		langList.innerHTML = allOption + languageOptions;
	}

	function chooseLang(value) {
		const code = String(value || '').trim();
		if (!code) {
			if (prefs.saveFeedLanguage) prefs.saveFeedLanguage('all');
			if (prefs.revealLanguages) {
				prefs.revealLanguages((cfg.LANGUAGES || []).map((lang) => lang.code));
			}
			if (i18n) i18n.setLocale('ru');
			renderLangPicker();
			if (catalog.length) render(catalog);
			document.dispatchEvent(new CustomEvent('ones-feed-language'));
			return;
		}
		if (!(cfg.LANGUAGES || []).some((lang) => lang.code === code)) return;
		if (prefs.saveFeedLanguage) prefs.saveFeedLanguage('');
		i18n.setLocale(code);
		prefs.revealLanguage(code);
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
			chooseLang(option.getAttribute('data-value'));
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
				if (option) chooseLang(option.getAttribute('data-value'));
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

	const onFeed = Boolean(document.querySelector('#feed'));

	root.addEventListener('change', onToggle);
	root.addEventListener('click', onMove);
	if (showAllBtn) showAllBtn.addEventListener('click', showAll);
	if (resetOrderBtn) resetOrderBtn.addEventListener('click', resetOrder);
	document.addEventListener('ones-locale', () => {
		prefs.revealLanguage(currentLocale());
		if (!onFeed) renderLangPicker();
		if (catalog.length) render(catalog);
	});
	document.addEventListener('ones-feed-language', () => {
		if (!onFeed) renderLangPicker();
		if (catalog.length) render(catalog);
	});
	if (!onFeed) bindLangPicker();
	load();
})();
