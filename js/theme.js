/** Theme toggle shared by index and about pages. */
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
