/** Hidden sources: opt-out list in localStorage. */
(function (global) {
	'use strict';

	const KEY = 'ones-hidden-sources';

	function loadHidden() {
		try {
			const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
			if (!Array.isArray(parsed)) return new Set();
			return new Set(parsed.map((name) => String(name || '').trim()).filter(Boolean));
		} catch (err) {
			return new Set();
		}
	}

	function saveHidden(names) {
		const unique = [
			...new Set([...names].map((name) => String(name || '').trim()).filter(Boolean)),
		];
		unique.sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));
		try {
			if (!unique.length) localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, JSON.stringify(unique));
		} catch (err) {
			/* ignore quota / private mode */
		}
	}

	function isHidden(name) {
		const key = String(name || '').trim();
		if (!key) return false;
		return loadHidden().has(key);
	}

	global.ONES_PREFS = {
		HIDDEN_KEY: KEY,
		loadHidden: loadHidden,
		saveHidden: saveHidden,
		isHidden: isHidden,
	};
})(window);
