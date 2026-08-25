/** Hidden sources and types: opt-out lists in localStorage. */
(function (global) {
	'use strict';

	const SOURCES_KEY = 'ones-hidden-sources';
	const TYPES_KEY = 'ones-hidden-types';

	function loadStringSet(key) {
		try {
			const parsed = JSON.parse(localStorage.getItem(key) || '[]');
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.map((value) => String(value || '').trim()).filter(Boolean));
		} catch (err) {
			return new Set();
		}
	}

	function saveStringSet(key, values) {
		const unique = [...new Set([...values].map((value) => String(value || '').trim()).filter(Boolean))];
		unique.sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
		try {
			if (!unique.length) localStorage.removeItem(key);
			else localStorage.setItem(key, JSON.stringify(unique));
		} catch (err) {
			/* ignore quota / private mode */
		}
	}

	function loadHidden() {
		return loadStringSet(SOURCES_KEY);
	}

	function saveHidden(names) {
		saveStringSet(SOURCES_KEY, names);
	}

	function isHidden(name) {
		const key = String(name || '').trim();
		if (!key) return false;
		return loadHidden().has(key);
	}

	function loadHiddenTypes() {
		return loadStringSet(TYPES_KEY);
	}

	function saveHiddenTypes(codes) {
		saveStringSet(TYPES_KEY, codes);
	}

	function isTypeHidden(code) {
		const key = String(code || '').trim();
		if (!key) return false;
		return loadHiddenTypes().has(key);
	}

	global.ONES_PREFS = {
		HIDDEN_KEY: SOURCES_KEY,
		HIDDEN_TYPES_KEY: TYPES_KEY,
		loadHidden: loadHidden,
		saveHidden: saveHidden,
		isHidden: isHidden,
		loadHiddenTypes: loadHiddenTypes,
		saveHiddenTypes: saveHiddenTypes,
		isTypeHidden: isTypeHidden,
	};
})(window);
