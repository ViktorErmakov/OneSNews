const { test, expect } = require('@playwright/test');
const { openSettings, waitForDay, card } = require('./helpers');

test.describe('Настройки', () => {
	test('группирует источники по языку и типу и даёт ссылки', async ({ page }) => {
		await openSettings(page);
		await expect(page.locator('h1')).toHaveText('Настройки');

		const langs = page.locator('.about-lang');
		await expect(langs).toHaveCount(2);
		await expect(langs.nth(0).locator('.about-lang-title')).toHaveText('Русский');
		await expect(langs.nth(1).locator('.about-lang-title')).toHaveText('English');

		await expect(langs.nth(0).locator('.about-type-title')).toHaveText(['Сайты', 'Telegram']);
		await expect(langs.nth(1).locator('.about-type-title')).toHaveText(['Сайты', 'Видеохостинги']);

		const habr = page.getByRole('link', { name: 'Habr 1C' });
		await expect(habr).toHaveAttribute('href', 'https://habr.com/ru/hubs/1c/');
		await expect(habr).toHaveAttribute('target', '_blank');
		await expect(habr).toHaveAttribute('rel', 'noopener noreferrer');

		await expect(page.getByRole('link', { name: 'Example YouTube' })).toHaveAttribute(
			'href',
			'https://www.youtube.com/channel/CHANNEL_ID',
		);

		await expect(page.locator('.about-sources')).toContainText('показывать на ленте');
		await expect(page.locator('.about-sources')).toContainText('Фильтр на главной');
		await expect(page.getByRole('checkbox', { name: 'Infostart' })).toBeChecked();
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeDisabled();
	});

	test('снятие галочки скрывает карточки источника на ленте', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Infostart' }).uncheck();
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-sources') || '[]'));
		expect(stored).toEqual(['Infostart']);
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeEnabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(4);
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
		await expect(card(page, '2026-03-15-002')).toBeVisible();

		await page.getByRole('button', { name: /Источник:/ }).click();
		await expect(page.locator('#source-picker-list [data-value="Infostart"]')).toHaveCount(0);
		await expect(page.locator('#source-picker-list [role="option"]').first().locator('.picker-count')).toHaveText(
			'4',
		);
	});

	test('«Показать все» возвращает скрытые источники', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Infostart' }).uncheck();
		await page.getByRole('button', { name: 'Показать все' }).click();
		await expect(page.getByRole('checkbox', { name: 'Infostart' })).toBeChecked();
		expect(await page.evaluate(() => localStorage.getItem('ones-hidden-sources'))).toBeNull();
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeDisabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(5);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
	});

	test('если скрыты все источники дня, лента показывает пустое состояние', async ({ page }) => {
		await openSettings(page);
		const boxes = page.locator('#sources input[type="checkbox"]');
		const count = await boxes.count();
		for (let i = 0; i < count; i += 1) {
			await boxes.nth(i).uncheck();
		}

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(0);
		await expect(page.locator('.empty-lead')).toHaveText('Вы скрыли источники за этот день.');
		await expect(page.locator('.empty-hint a')).toHaveAttribute('href', 'settings.html');
		await expect(page.locator('#source-picker')).toBeHidden();
	});
});
