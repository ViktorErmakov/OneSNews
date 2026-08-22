(function () {
	'use strict';

	const cfg = window.ONES_CONFIG;
	const root = document.querySelector('#sources');
	if (!root || !cfg) return;

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

	function render(sources) {
		if (!sources.length) {
			setMessage('Пока нет включённых источников.');
			return;
		}

		const parts = [];
		for (const lang of languageOrder(sources)) {
			const byLang = sources.filter((item) => item.language === lang.code);
			if (!byLang.length) continue;
			parts.push('<section class="about-lang">');
			parts.push(`<h3 class="about-lang-title">${escapeHtml(lang.label)}</h3>`);
			for (const type of typesFor(byLang)) {
				const byType = byLang.filter((item) => (item.source_type || 'other') === type.code);
				if (!byType.length) continue;
				parts.push(`<h4 class="about-type-title">${escapeHtml(type.label)}</h4>`);
				parts.push('<ul class="about-source-list">');
				for (const src of byType) {
					parts.push(
						'<li>' +
							`<a href="${escapeHtml(src.home)}" target="_blank" rel="noopener noreferrer">` +
							`${escapeHtml(src.name || src.home)}${EXTERNAL_SVG}</a>` +
							'</li>'
					);
				}
				parts.push('</ul>');
			}
			parts.push('</section>');
		}
		root.innerHTML = parts.join('');
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

	load();
})();
