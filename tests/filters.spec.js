const { test, expect } = require('@playwright/test');
const { openIndex, card } = require('./helpers');

test.describe('Фильтры', () => {
	test('пикер источника показывает счётчики и фильтрует ленту', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /Источник:/ }).click();
		const options = page.locator('#source-picker-list [role="option"]');
		await expect(options).toHaveCount(4);
		await expect(options.first()).toHaveAttribute('data-value', '');
		await expect(options.first()).toContainText('Все');
		await expect(options.first().locator('.picker-count')).toHaveText('3');

		await page.locator('#source-picker-list [data-value="Infostart"]').click();
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(page.locator('#day-count')).toHaveText('1 материал');
		await expect(page.locator('#source-picker-list')).toBeHidden();
		await expect(page.getByRole('button', { name: /Источник: Infostart/ })).toBeVisible();
	});

	test('пикер языка переключает ленту и календарь без пункта «все языки»', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /Язык:/ }).click();
		const options = page.locator('#lang-picker-list [role="option"]');
		await expect(options).toHaveCount(2);
		await expect(options.first()).toHaveAttribute('data-value', 'ru');
		await expect(page.locator('#lang-picker-list [data-value=""]')).toHaveCount(0);

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
});
