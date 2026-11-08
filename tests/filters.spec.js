const { test, expect } = require('@playwright/test');
const { openIndex, card, waitForDay } = require('./helpers');

test.describe('Фильтры', () => {
	test('пикер источника показывает счётчики и фильтрует ленту', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /Источник:/ }).click();
		const options = page.locator('#source-picker-list [role="option"]');
		await expect(options).toHaveCount(4);
		await expect(options.first()).toHaveAttribute('data-value', '');
		await expect(options.first()).toContainText('Все');
		await expect(options.first().locator('.picker-count')).toHaveText('3');
		await expect(page.locator('#source-picker-list .picker-group-label')).toHaveText(['Сайты', 'Telegram']);

		await page.locator('#source-picker-list [data-value="Infostart"]').click();
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(page.locator('#section-nav')).toBeHidden();
		await expect(page.locator('.section-title')).toHaveText('Сайты');
		await expect(page.locator('#source-picker-list')).toBeHidden();
		await expect(page.getByRole('button', { name: /Источник: Infostart/ })).toBeVisible();
	});

	test('пикер языка переключает ленту и календарь и даёт пункт «все языки»', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /Язык:/ }).click();
		const options = page.locator('#lang-picker-list [role="option"]');
		await expect(options).toHaveCount(3);
		await expect(options.first()).toHaveAttribute('data-value', '');
		await expect(options.first()).toContainText('Все языки');
		await expect(options.nth(1)).toHaveAttribute('data-value', 'ru');

		await page.locator('#lang-picker-list [data-value="en"]').click();
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-005')).toBeVisible();
		await expect(page.locator('#section-telegram')).toHaveCount(0);
		await expect(page).toHaveURL(/lang=en/);

		await page.getByRole('button', { name: /Source:|Источник:/ }).click();
		const sourceOptions = page.locator('#source-picker-list [role="option"]');
		await expect(sourceOptions).toHaveCount(3);
		await expect(sourceOptions.first().locator('.picker-count')).toHaveText('2');
		await expect(page.locator('#source-picker-list .picker-group-label')).toHaveText(['Sites', 'Video hosts']);
	});

	test('чипы на карточке включают фильтр источника', async ({ page }) => {
		await openIndex(page);
		await card(page, '2026-03-15-001')
			.getByRole('button', { name: /Фильтр по источнику: Infostart/ })
			.click();
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(card(page, '2026-03-15-001')).toBeVisible();

		await page.getByRole('button', { name: /Источник:/ }).click();
		await page.locator('#source-picker-list [data-value=""]').click();
		await expect(page.locator('article.card')).toHaveCount(3);
	});

	test('клавиатура открывает список, выбирает пункт и закрывает его Escape', async ({ page }) => {
		await openIndex(page);
		const langBtn = page.getByRole('button', { name: /Язык:|Language:/ });
		await langBtn.focus();
		await page.keyboard.press('ArrowDown');
		await expect(page.locator('#lang-picker-list')).toBeVisible();

		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(page.locator('#lang-picker-list')).toBeHidden();
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);

		await langBtn.click();
		await expect(page.locator('#lang-picker-list')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('#lang-picker-list')).toBeHidden();
		await expect(langBtn).toBeFocused();
	});

	test('«все языки» показывает оба языка и не меняет интерфейс', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /Язык:/ }).click();
		await page.locator('#lang-picker-list [data-value=""]').click();

		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
		await expect(page).not.toHaveURL(/[?&]lang=/);
		await expect(page.getByRole('button', { name: 'Язык: Все языки' })).toBeVisible();
		await expect(page.locator('article.card')).toHaveCount(5);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(page.locator('#section-video')).toBeVisible();
		await expect(card(page, '2026-03-15-001').getByRole('button', { name: 'Фильтр по языку: Русский' })).toBeVisible();
		await expect(card(page, '2026-03-15-004').getByRole('button', { name: 'Фильтр по языку: English' })).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('ones-feed-language'))).toBe('all');
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-languages') || '[]'))).toEqual(
			[],
		);
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-last-date') || '{}'))).toMatchObject({
			all: '2026-03-15',
		});

		await page.getByRole('button', { name: /^Дата:/ }).click();
		await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
		await expect(page.locator('.calendar-day.has-news[data-date="2026-02-10"]')).toBeVisible();
		await page.keyboard.press('Escape');

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(5);
		await expect(page).not.toHaveURL(/[?&]lang=/);
		await expect(page.locator('html')).toHaveAttribute('lang', 'ru');

		await card(page, '2026-03-15-004').getByRole('button', { name: 'Фильтр по языку: English' }).click();
		await waitForDay(page);
		await expect(page).toHaveURL(/lang=en/);
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
		expect(await page.evaluate(() => localStorage.getItem('ones-feed-language'))).toBeNull();
	});

	test('сохранённые «все языки» открываются без параметра, ?lang=en их сменяет', async ({ page }) => {
		await openIndex(page, { feedLanguage: 'all', hiddenLanguages: [] });
		await expect(page.locator('article.card')).toHaveCount(5);
		await expect(page).not.toHaveURL(/[?&]lang=/);
		await expect(card(page, '2026-03-15-001').getByRole('button', { name: 'Фильтр по языку: Русский' })).toBeVisible();

		await page.goto('/?lang=en');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('ones-feed-language'))).toBeNull();
	});

	test('?lang=all включает оба языка даже если один скрыт', async ({ page }) => {
		await openIndex(page, { path: '/?lang=all', hiddenLanguages: ['en'] });
		await expect(page).not.toHaveURL(/[?&]lang=/);
		await expect(page.locator('article.card')).toHaveCount(5);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		expect(await page.evaluate(() => localStorage.getItem('ones-feed-language'))).toBe('all');
	});
});
