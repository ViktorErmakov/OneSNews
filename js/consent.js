/** Analytics opt-in. Functional localStorage (theme, read, search) is not gated. */
(function () {
	'use strict';

	const KEY = 'ones-consent';
	const VERSION = 1;
	const METRIKA_ID = 111876187;
	const METRIKA_SRC = 'https://mc.yandex.ru/metrika/tag.js?id=' + METRIKA_ID;

	let metrikaLoaded = false;

	function readChoice() {
		try {
			const parsed = JSON.parse(localStorage.getItem(KEY) || 'null');
			if (!parsed || parsed.v !== VERSION || typeof parsed.analytics !== 'boolean') {
				return null;
			}
			return parsed;
		} catch (err) {
			return null;
		}
	}

	function writeChoice(analytics) {
		try {
			localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics: analytics }));
		} catch (err) {
			/* ignore quota / private mode */
		}
	}

	function clearMetrikaStorage() {
		const names = document.cookie ? document.cookie.split(';') : [];
		for (let i = 0; i < names.length; i += 1) {
			const name = names[i].split('=')[0].trim();
			if (!name) continue;
			if (name.indexOf('_ym') === 0 || name === 'yabs-sid') {
				document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
			}
		}
		try {
			const keys = Object.keys(localStorage);
			for (let i = 0; i < keys.length; i += 1) {
				const key = keys[i];
				if (key.indexOf('_ym') === 0 || key.indexOf('ym-') === 0) {
					localStorage.removeItem(key);
				}
			}
		} catch (err) {
			/* ignore */
		}
	}

	function loadMetrika() {
		if (metrikaLoaded || document.querySelector('script[src*="mc.yandex.ru/metrika"]')) {
			metrikaLoaded = true;
			return;
		}
		metrikaLoaded = true;

		(function (m, e, t, r, i, k, a) {
			m[i] =
				m[i] ||
				function () {
					(m[i].a = m[i].a || []).push(arguments);
				};
			m[i].l = 1 * new Date();
			for (let j = 0; j < document.scripts.length; j += 1) {
				if (document.scripts[j].src === r) {
					return;
				}
			}
			k = e.createElement(t);
			a = e.getElementsByTagName(t)[0];
			k.async = 1;
			k.src = r;
			a.parentNode.insertBefore(k, a);
		})(window, document, 'script', METRIKA_SRC, 'ym');

		window.ym(METRIKA_ID, 'init', {
			ssr: true,
			clickmap: true,
			accurateTrackBounce: true,
			trackLinks: true,
			referrer: document.referrer,
			url: location.href,
		});
	}

	function bannerEl() {
		return document.querySelector('#consent-banner');
	}

	function hideBanner() {
		const el = bannerEl();
		if (el) el.remove();
		document.body.classList.remove('has-consent-banner');
	}

	function showBanner() {
		if (bannerEl()) return;
		const onPrivacy = /privacy\.html$/i.test(location.pathname);
		const el = document.createElement('div');
		el.id = 'consent-banner';
		el.className = 'consent-banner';
		el.setAttribute('role', 'region');
		el.setAttribute('aria-label', 'Согласие на аналитику');
		el.innerHTML =
			'<div class="shell consent-inner">' +
			'<p class="consent-text">' +
			'Для статистики посещений можем включить Яндекс.Метрику. Тема, «прочитано» и поиск остаются только в вашем браузере.' +
			(onPrivacy ? '' : ' <a href="privacy.html">Подробнее</a>') +
			'</p>' +
			'<div class="consent-actions">' +
			'<button type="button" class="consent-btn consent-btn-reject" data-consent="reject">Отклонить</button>' +
			'<button type="button" class="consent-btn consent-btn-accept" data-consent="accept">Принять</button>' +
			'</div>' +
			'</div>';
		document.body.appendChild(el);
		document.body.classList.add('has-consent-banner');
	}

	function syncSettings() {
		const status = document.querySelector('#consent-status');
		if (!status) return;
		const choice = readChoice();
		if (!choice) {
			status.textContent = 'Вы ещё не сделали выбор. Счётчик посещений выключен.';
			return;
		}
		status.textContent = choice.analytics
			? 'Яндекс.Метрика включена. Можно отключить в любой момент — счётчик перестанет загружаться.'
			: 'Яндекс.Метрика выключена. Функции сайта от этого не зависят.';
	}

	function applyChoice(analytics) {
		const previous = readChoice();
		const wasLoaded = metrikaLoaded || Boolean(document.querySelector('script[src*="mc.yandex.ru/metrika"]'));
		writeChoice(analytics);
		hideBanner();
		if (analytics) {
			loadMetrika();
			syncSettings();
			return;
		}
		clearMetrikaStorage();
		syncSettings();
		if (wasLoaded && previous && previous.analytics) {
			location.reload();
		}
	}

	function onClick(event) {
		const btn = event.target.closest('[data-consent]');
		if (!btn) return;
		const value = btn.getAttribute('data-consent');
		if (value === 'accept') applyChoice(true);
		if (value === 'reject') applyChoice(false);
	}

	document.addEventListener('click', onClick);

	const choice = readChoice();
	if (!choice) {
		showBanner();
	} else if (choice.analytics) {
		loadMetrika();
	}
	syncSettings();
})();
