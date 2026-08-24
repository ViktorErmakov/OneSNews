/** Theme toggle shared by all pages. */
(function () {
	'use strict';

	const KEY = 'ones-theme';

	function currentTheme() {
		return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
	}

	function syncButton() {
		const btn = document.querySelector('#theme-toggle');
		if (!btn) return;
		const dark = currentTheme() === 'dark';
		btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
		btn.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
	}

	function setTheme(theme) {
		document.documentElement.setAttribute('data-theme', theme);
		const cs = document.querySelector('meta[name="color-scheme"]');
		if (cs) cs.setAttribute('content', theme);
		try {
			localStorage.setItem(KEY, theme);
		} catch (err) {
			/* ignore quota / private mode */
		}
		syncButton();
	}

	if (!document.documentElement.getAttribute('data-theme')) {
		let stored = null;
		try {
			stored = localStorage.getItem(KEY);
		} catch (err) {
			stored = null;
		}
		if (stored !== 'light' && stored !== 'dark') {
			stored = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		document.documentElement.setAttribute('data-theme', stored);
	}

	const btn = document.querySelector('#theme-toggle');
	if (btn) {
		btn.addEventListener('click', () => {
			setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
		});
	}
	syncButton();
})();
