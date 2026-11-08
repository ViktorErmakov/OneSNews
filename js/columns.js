/** Feed-card columns on wide screens. Phones stay one column. */
(function () {
	'use strict';

	const KEY = 'ones-columns';

	function currentColumns() {
		return document.documentElement.getAttribute('data-columns') === 'single' ? 'single' : 'multi';
	}

	function t(key) {
		return window.ONES_I18N ? window.ONES_I18N.t(key) : key;
	}

	function syncButton() {
		const btn = document.querySelector('#columns-toggle');
		if (!btn) return;
		const single = currentColumns() === 'single';
		btn.setAttribute('aria-pressed', single ? 'false' : 'true');
		btn.setAttribute('aria-label', t(single ? 'columns.multi' : 'columns.single'));
	}

	function setColumns(mode) {
		const next = mode === 'single' ? 'single' : 'multi';
		document.documentElement.setAttribute('data-columns', next);
		try {
			localStorage.setItem(KEY, next);
		} catch (err) {
			/* ignore quota / private mode */
		}
		syncButton();
	}

	if (!document.documentElement.getAttribute('data-columns')) {
		let stored = null;
		try {
			stored = localStorage.getItem(KEY);
		} catch (err) {
			stored = null;
		}
		document.documentElement.setAttribute('data-columns', stored === 'single' ? 'single' : 'multi');
	}

	const btn = document.querySelector('#columns-toggle');
	if (btn) {
		btn.addEventListener('click', () => {
			setColumns(currentColumns() === 'single' ? 'multi' : 'single');
		});
	}
	syncButton();
	document.addEventListener('ones-locale', syncButton);
})();
