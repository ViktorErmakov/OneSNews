const { test, expect } = require('@playwright/test');
const { openIndex, card, waitForDay } = require('./helpers');

test.describe('Лента', () => {
	test('показывает разделы и карточки', async ({ page }) => {
		await openIndex(page);

		await expect(page.locator('#day-count')).toHaveCount(0);
		await expect(page.locator('#section-nav')).toBeVisible();
		await expect(page.locator('#section-nav a')).toHaveCount(2);
		await expect(page.locator('#section-nav a').nth(0)).toHaveText('Сайты · 2');
		await expect(page.locator('#section-nav a').nth(1)).toHaveText('Telegram · 1');
		await expect(page.locator('#section-site .section-title')).toHaveText('Сайты');
		await expect(page.locator('#section-telegram .section-title')).toHaveText('Telegram');

		await expect(page.locator('#section-site')).toBeVisible();
		await expect(page.locator('#section-telegram')).toBeVisible();
		await expect(page.locator('#section-video')).toHaveCount(0);
		await expect(page.locator('article.card')).toHaveCount(3);

		const invoice = card(page, '2026-03-15-001');
		await expect(invoice.locator('.card-title a')).toHaveAttribute(
			'href',
			'https://example.com/infostart-invoice',
		);
		await expect(invoice.locator('.card-title a')).toHaveAttribute('target', '_blank');
		await expect(invoice.locator('.card-title a')).toHaveAttribute('rel', 'noopener noreferrer');
		await expect(invoice.locator('.card-summary')).toContainText('БП 3.0');
		await expect(invoice.locator('.card-meta')).toContainText('AlexSvoykin');
		await expect(invoice.locator('.card-topics')).toHaveCount(0);
		await expect(invoice.getByRole('button', { name: /Фильтр по источнику: Infostart/ })).toBeVisible();
		await expect(invoice.getByRole('button', { name: /Фильтр по языку:/ })).toHaveCount(0);
	});

	test('раздел сворачивается по заголовку и раскрывается снова', async ({ page }) => {
		await openIndex(page);
		const sites = page.locator('#section-site');
		const toggle = sites.getByRole('button', { name: 'Сайты' });
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(toggle.locator('.section-chevron')).toBeVisible();
		expect(
			await toggle.evaluate((el) => el.firstElementChild.classList.contains('section-chevron')),
		).toBe(true);

		await toggle.click();
		expect(
			await sites.locator('.section-chevron').evaluate((el) => getComputedStyle(el).transform),
		).not.toBe('none');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sites).toHaveClass(/is-collapsed/);
		await expect(sites.locator('.card').first()).toBeHidden();
		await expect(page.locator('#section-telegram .card')).toBeVisible();

		await page.locator('#feed-search').fill('платформы');
		await expect(sites.locator('.card').first()).toBeHidden();
		await page.locator('#search-clear').click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sites.locator('.card').first()).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sites.locator('.card').first()).toBeVisible();

		const telegram = page.locator('#section-telegram');
		const telegramToggle = telegram.getByRole('button', { name: 'Telegram' });
		await telegramToggle.focus();
		await page.keyboard.press('Enter');
		await expect(telegramToggle).toHaveAttribute('aria-expanded', 'false');
		await expect(telegram.locator('.card')).toBeHidden();

		await toggle.click();
		await page.locator('#section-nav a').nth(0).click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sites.locator('.card').first()).toBeVisible();
	});

	test('кнопка «Наверх» появляется после прокрутки и возвращает к началу', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 360 });
		await openIndex(page);
		const toTop = page.locator('#to-top');
		await expect(toTop).toBeHidden();
		await page.evaluate(() => {
			const spacer = document.createElement('div');
			spacer.style.height = `${window.innerHeight * 2}px`;
			document.body.appendChild(spacer);
			window.scrollTo(0, document.body.scrollHeight);
		});
		await expect(toTop).toBeVisible();
		await expect(toTop).toHaveAccessibleName('Наверх');
		await page.locator('#settings-open').click();
		await expect(toTop).toBeHidden();
		await page.keyboard.press('Escape');
		await expect(toTop).toBeVisible();

		await toTop.click();
		await page.waitForFunction(() => window.scrollY < 20);
		await expect(toTop).toBeHidden();
	});

	test('кнопка «Наверх» стоит выше полосы согласия', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 700 });
		await openIndex(page, { consent: 'none' });
		await page.evaluate(() => {
			const spacer = document.createElement('div');
			spacer.style.height = `${window.innerHeight * 2}px`;
			document.body.appendChild(spacer);
			window.scrollTo(0, document.body.scrollHeight);
		});
		const toTop = page.locator('#to-top');
		await expect(toTop).toBeVisible();
		const button = await toTop.boundingBox();
		const banner = await page.locator('#consent-banner').boundingBox();
		expect(button.y + button.height).toBeLessThanOrEqual(banner.y + 1);
	});

	test('скрывает пустое саммари и автора, если он совпадает с источником', async ({ page }) => {
		await openIndex(page);
		const short = card(page, '2026-03-15-003');
		await expect(short.locator('.card-summary')).toHaveCount(0);
		await expect(short.locator('.card-meta > span')).toHaveCount(0);
		await expect(short.getByRole('button', { name: /Фильтр по источнику:/ })).toBeVisible();

		const habr = card(page, '2026-03-15-002');
		await expect(habr.locator('.card-meta')).not.toContainText('Не указан');
		await expect(habr.locator('.card-topics')).toHaveCount(0);
	});

	test('скрывает навигацию секций и лишние чипы, если источник один', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-02-10' });
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
		await expect(page.locator('#section-nav')).toBeHidden();
		await expect(page.locator('.section-title')).toHaveText('Сайты');
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(page.locator('.chip')).toHaveCount(0);
		await page.getByRole('button', { name: /Источник:/ }).click();
		await expect(page.locator('#source-picker-list [role="option"]')).toHaveCount(1);
		await expect(page.locator('#source-picker-list [role="option"]')).toHaveAttribute(
			'data-value',
			'Infostart',
		);
	});

	test('дата без новостей на языке не открывается, подставляется свежая', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-01-05' });
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 15 марта 2026');
		await expect(page.locator('article.card')).toHaveCount(3);
	});

	test('берёт дату из адреса и запоминает её для языка', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-02-10' });
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-last-date') || '{}'))).toEqual({
			ru: '2026-02-10',
		});
	});

	test('без ?date= открывает запомненную дату языка, если она есть в календаре', async ({ page }) => {
		await openIndex(page, { lastDate: { ru: '2026-02-10' } });
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
	});

	test('невалидный ?date= откатывается к запомненной дате языка', async ({ page }) => {
		await openIndex(page, { path: '/?date=1999-01-01', lastDate: { ru: '2026-02-10' } });
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
	});

	test('невалидная запомненная дата языка игнорируется, открывается свежая', async ({ page }) => {
		await openIndex(page, { lastDate: { ru: '1999-01-01' } });
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 15 марта 2026');
	});

	test('запомненная дата языка важнее ?date=', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-03-15', lastDate: { ru: '2026-02-10' } });
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
	});

	test('дата чужого языка не подставляется', async ({ page }) => {
		await openIndex(page, { lastDate: { en: '2026-02-10', ru: '2026-03-15' } });
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 15 марта 2026');
	});

	test('есть ссылка «к содержанию» и ссылки в подвале', async ({ page }) => {
		await openIndex(page);
		const skip = page.locator('a.skip-link');
		await expect(skip).toHaveAttribute('href', '#main');
		await expect(skip).toHaveText('К содержанию');

		const header = page.locator('.top-nav');
		await expect(header.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', 'settings.html');

		const footer = page.locator('#feed-footer');
		await expect(footer.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', 'settings.html');
		await expect(footer.getByRole('link', { name: 'Пожелания' })).toHaveAttribute(
			'href',
			/mailto:mopdeus@gmail.com/,
		);
	});

	test('язык браузера en открывает английскую ленту', async ({ page }) => {
		await openIndex(page, { locale: 'browser-en' });
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Date: March 15, 2026');
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
	});

	test('pageshow persisted перечитывает индекс и оставляет запомненный день', async ({ page }) => {
		await openIndex(page, {
			path: '/?date=2026-02-10',
			lastDate: { ru: '2026-02-10' },
			index: {
				site: 'OneS News',
				dates_by_language: {
					ru: ['2026-02-10'],
					en: ['2026-03-15'],
				},
			},
		});
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#another-day-next')).toBeHidden();

		await page.unroute(/\/data\/index\.json(?:\?|$)/);
		await page.route(/\/data\/index\.json(?:\?|$)/, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					site: 'OneS News',
					dates_by_language: {
						ru: ['2026-03-15', '2026-02-10'],
						en: ['2026-03-15'],
					},
				}),
			}),
		);

		await page.evaluate(() => {
			const event = new Event('pageshow');
			Object.defineProperty(event, 'persisted', { value: true });
			window.dispatchEvent(event);
		});
		await waitForDay(page);

		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
		await expect(page.locator('#another-day-next')).toHaveText('15 марта');
		await expect(page.locator('#another-day-next')).toBeVisible();
	});

	test('возврат на вкладку перечитывает индекс и оставляет запомненный день', async ({ page }) => {
		await openIndex(page, {
			path: '/?date=2026-02-10',
			lastDate: { ru: '2026-02-10' },
			index: {
				site: 'OneS News',
				dates_by_language: {
					ru: ['2026-02-10'],
					en: ['2026-03-15'],
				},
			},
		});
		await expect(page.locator('#another-day-next')).toBeHidden();

		await page.unroute(/\/data\/index\.json(?:\?|$)/);
		await page.route(/\/data\/index\.json(?:\?|$)/, (route) =>
			route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					site: 'OneS News',
					dates_by_language: {
						ru: ['2026-03-15', '2026-02-10'],
						en: ['2026-03-15'],
					},
				}),
			}),
		);

		await page.evaluate(() => {
			const proto = Document.prototype;
			const original = Object.getOwnPropertyDescriptor(proto, 'visibilityState');
			const setState = (value) => {
				Object.defineProperty(proto, 'visibilityState', {
					configurable: true,
					get: () => value,
				});
				document.dispatchEvent(new Event('visibilitychange'));
			};
			setState('hidden');
			setState('visible');
			if (original) Object.defineProperty(proto, 'visibilityState', original);
		});

		await expect(page.locator('#another-day-next')).toHaveText('15 марта');
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#date-picker-btn')).toHaveAttribute('aria-label', 'Дата: 10 февраля 2026');
	});
});
