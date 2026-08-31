const { test, expect } = require('@playwright/test');
const { openIndex, card } = require('./helpers');

test.describe('Лента', () => {
	test('показывает заголовок дня, счётчик, секции и карточки', async ({ page }) => {
		await openIndex(page);

		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
		await expect(page.locator('#day-count')).toHaveText('3 материала');
		await expect(page.locator('#section-nav')).toBeVisible();
		await expect(page.locator('#section-nav a')).toHaveCount(2);
		await expect(page.locator('#section-nav a').nth(0)).toContainText('Сайты');
		await expect(page.locator('#section-nav a').nth(1)).toContainText('Telegram');

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
		await expect(invoice.locator('.card-topics')).toHaveText('ERP · БП');
		await expect(invoice.getByRole('button', { name: /Фильтр по источнику: Infostart/ })).toBeVisible();
		await expect(invoice.getByRole('button', { name: /Фильтр по языку:/ })).toHaveCount(0);
	});

	test('скрывает пустое саммари и автора, если он совпадает с источником', async ({ page }) => {
		await openIndex(page);
		const short = card(page, '2026-03-15-003');
		await expect(short.locator('.card-summary')).toHaveCount(0);
		await expect(short.locator('.card-meta > span:not(.card-topics)')).toHaveCount(0);
		await expect(short.getByRole('button', { name: /Фильтр по источнику:/ })).toBeVisible();

		const habr = card(page, '2026-03-15-002');
		await expect(habr.locator('.card-meta')).not.toContainText('Не указан');
		await expect(habr.locator('.card-topics')).toHaveText('разработка');
	});

	test('скрывает навигацию секций и лишние чипы, если источник один', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-02-10' });
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 10 февраля 2026');
		await expect(page.locator('#day-count')).toHaveText('1 материал');
		await expect(page.locator('#section-nav')).toBeHidden();
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
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
		await expect(page.locator('article.card')).toHaveCount(3);
	});

	test('берёт дату из адреса или подставляет самую новую', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-02-10' });
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 10 февраля 2026');

		await openIndex(page, { path: '/?date=1999-01-01' });
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
	});

	test('есть ссылка «к содержанию» и ссылки в подвале', async ({ page }) => {
		await openIndex(page);
		const skip = page.locator('a.skip-link');
		await expect(skip).toHaveAttribute('href', '#main');
		await expect(skip).toHaveText('К содержанию');

		const header = page.locator('.top-nav');
		await expect(header.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', 'settings.html');

		const footer = page.locator('footer');
		await expect(footer.getByRole('link', { name: 'Настройки' })).toHaveAttribute('href', 'settings.html');
		await expect(footer.getByRole('link', { name: 'Пожелания' })).toHaveAttribute(
			'href',
			/mailto:mopdeus@gmail.com/,
		);
	});

	test('язык браузера en открывает английскую ленту', async ({ page }) => {
		await openIndex(page, { locale: 'browser-en' });
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.locator('#day-title')).toContainText('Digest for');
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
	});
});
