const { test, expect } = require('@playwright/test');
const { openIndex, card } = require('./helpers');

test.describe('Поиск', () => {
	test('фильтрует по заголовку и саммари и подсвечивает совпадения', async ({ page }) => {
		await openIndex(page);
		await page.locator('#feed-search').fill('покупателю');
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(page.locator('#feed-search ~ .search-clear, #search-clear')).toBeVisible();
		await expect(card(page, '2026-03-15-001').locator('mark')).toContainText(/покупателю/i);

		await page.locator('#feed-search').fill('debugging');
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-004').locator('.card-summary mark')).toContainText(
			/debugging/i,
		);
	});

	test('показывает пустой результат, если ничего не найдено', async ({ page }) => {
		await openIndex(page);
		await page.locator('#feed-search').fill('zxqvnotfound');
		await expect(page.locator('.empty-lead')).toHaveText('Ничего не найдено по запросу «zxqvnotfound».');
		await expect(page.locator('.empty-hint')).toContainText('сбросьте поиск');
	});

	test('кнопка сброса очищает запрос', async ({ page }) => {
		await openIndex(page);
		await page.locator('#feed-search').fill('покупателю');
		await expect(page.locator('article.card')).toHaveCount(1);
		await page.locator('#search-clear').click();
		await expect(page.locator('#feed-search')).toHaveValue('');
		await expect(page.locator('article.card')).toHaveCount(5);
	});

	test('запоминает запросы, позволяет выбрать и удалить их', async ({ page }) => {
		await openIndex(page);
		const input = page.locator('#feed-search');
		await input.fill('покупателю');
		await input.press('Enter');

		await input.click();
		await expect(page.locator('#search-history')).toBeVisible();
		await expect(page.locator('#search-history [role="option"]')).toContainText('покупателю');

		await page.locator('#search-clear').click();
		await expect(page.locator('#feed-search')).toHaveValue('');
		await expect(page.locator('#search-history')).toBeVisible();
		await page.locator('#search-history [data-query="покупателю"]').click();
		await expect(page.locator('article.card')).toHaveCount(1);

		await input.blur();
		await input.click();
		await expect(page.locator('#search-history')).toBeVisible();
		await page.locator('#search-history [data-remove="покупателю"]').click();
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-search-history') || '[]'));
		expect(stored).toEqual([]);
	});

	test('Escape сначала закрывает историю, затем очищает запрос', async ({ page }) => {
		await openIndex(page);
		const input = page.locator('#feed-search');
		await input.fill('покупателю');
		await input.press('Enter');
		await input.click();
		await expect(page.locator('#search-history')).toBeVisible();
		await input.press('Escape');
		await expect(page.locator('#search-history')).toBeHidden();
		await expect(input).toHaveValue('покупателю');
		await input.press('Escape');
		await expect(input).toHaveValue('');
		await expect(page.locator('article.card')).toHaveCount(5);
	});
});
