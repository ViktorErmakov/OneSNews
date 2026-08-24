const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const FIXTURES = path.join(__dirname, 'fixtures');

function readJson(rel) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES, rel), 'utf8'));
}

function defaultFixtures() {
	return {
		index: readJson('index.json'),
		days: {
			'2026-03-15': readJson('days/2026-03-15.json'),
			'2026-02-10': readJson('days/2026-02-10.json'),
			'2026-01-05': readJson('days/2026-01-05.json'),
		},
		sources: readJson('sources.json'),
	};
}

function mergeFixtures(overrides) {
	const base = defaultFixtures();
	if (!overrides) return base;
	return {
		index: overrides.index || base.index,
		days: { ...base.days, ...(overrides.days || {}) },
		sources: overrides.sources || base.sources,
		indexStatus: overrides.indexStatus,
		sourcesStatus: overrides.sourcesStatus,
	};
}

async function installAppMocks(page, overrides) {
	const fixtures = mergeFixtures(overrides);

	await page.route(/mc\.yandex\.ru/, (route) => route.abort());

	await page.route(/\/data\/index\.json(?:\?|$)/, (route) => {
		if (fixtures.indexStatus && fixtures.indexStatus !== 200) {
			return route.fulfill({ status: fixtures.indexStatus, body: 'error' });
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(fixtures.index),
		});
	});

	await page.route(/\/data\/days\/[^/?#]+\.json(?:\?|$)/, (route) => {
		const match = route.request().url().match(/days\/(\d{4}-\d{2}-\d{2})\.json/);
		const date = match && match[1];
		const day = date && fixtures.days[date];
		if (!day) {
			return route.fulfill({ status: 404, body: 'not found' });
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(day),
		});
	});

	await page.route(/\/data\/sources\.json(?:\?|$)/, (route) => {
		if (fixtures.sourcesStatus && fixtures.sourcesStatus !== 200) {
			return route.fulfill({ status: fixtures.sourcesStatus, body: 'error' });
		}
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(fixtures.sources),
		});
	});
}

async function installConsent(page, consent) {
	if (consent === 'none') return;
	const choice = consent || 'decline';
	await page.addInitScript((value) => {
		try {
			localStorage.setItem(
				'ones-consent',
				JSON.stringify({ v: 1, analytics: value === 'accept' }),
			);
		} catch (err) {
			/* ignore */
		}
	}, choice);
}

function metrikaScript(page) {
	return page.locator('script[src*="mc.yandex.ru/metrika"]');
}

async function waitForDay(page) {
	await expect(page.locator('#day-title')).not.toHaveText('Загрузка…', { timeout: 10000 });
}

async function openIndex(page, options) {
	const opts = options || {};
	await installAppMocks(page, opts);
	await installConsent(page, opts.consent);
	await page.goto(opts.path || '/');
	if (opts.wait === 'status') {
		await expect(page.locator('#status')).toBeVisible({ timeout: 10000 });
		return;
	}
	await waitForDay(page);
}

async function openAbout(page, options) {
	const opts = options || {};
	await installAppMocks(page, opts);
	await installConsent(page, opts.consent);
	await page.goto(opts.path || '/about.html');
	await expect(page.locator('h1')).toHaveText('О проекте');
}

async function openSettings(page, options) {
	const opts = options || {};
	await installAppMocks(page, opts);
	await installConsent(page, opts.consent);
	if (opts.hiddenSources) {
		await page.addInitScript((names) => {
			try {
				if (!names.length) localStorage.removeItem('ones-hidden-sources');
				else localStorage.setItem('ones-hidden-sources', JSON.stringify(names));
			} catch (err) {
				/* ignore */
			}
		}, opts.hiddenSources);
	}
	await page.goto(opts.path || '/settings.html');
	await expect(page.locator('#sources')).not.toHaveText('Загрузка…', { timeout: 10000 });
}

async function openPrivacy(page, options) {
	const opts = options || {};
	await installAppMocks(page, opts);
	await installConsent(page, opts.consent);
	const path = opts.path || '/settings.html#privacy';
	await page.goto(path);
	await expect(page.locator('#privacy')).toBeVisible({ timeout: 10000 });
}

function card(page, id) {
	return page.locator(`article.card[data-id="${id}"]`);
}

module.exports = {
	defaultFixtures,
	installAppMocks,
	openIndex,
	openAbout,
	openSettings,
	openPrivacy,
	waitForDay,
	card,
	metrikaScript,
};
