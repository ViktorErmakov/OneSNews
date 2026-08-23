const { test, expect } = require('@playwright/test');
const { openIndex, waitForDay } = require('./helpers');

test.describe('Календарь', () => {
	test('открывается, выбирает дату, обновляет адрес и сбрасывает поиск', async ({ page }) => {
		await openIndex(page);
		await page.locator('#feed-search').fill('покупателю');
		await expect(page.locator('article.card')).toHaveCount(1);

		await page.getByRole('button', { name: /^Дата:/ }).click();
		await expect(page.locator('#date-picker-panel')).toBeVisible();
		await expect(page.locator('.calendar-title')).toHaveText('Март 2026');
		await expect(page.getByRole('button', { name: 'Следующий месяц' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Предыдущий месяц' })).toBeEnabled();

		await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
		await expect(page.locator('.calendar-title')).toHaveText('Февраль 2026');
		await page.getByRole('button', { name: '10 февраля 2026' }).click();
		await waitForDay(page);

		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 10 февраля 2026');
		await expect(page.locator('#feed-search')).toHaveValue('');
		await expect(page.locator('article.card')).toHaveCount(1);
		await expect(page.locator('#date-picker-panel')).toBeHidden();
	});

	test('переключение месяцев не выходит за опубликованные даты', async ({ page }) => {
		await openIndex(page);
		await page.getByRole('button', { name: /^Дата:/ }).click();

		await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
		await expect(page.locator('.calendar-title')).toHaveText('Февраль 2026');
		await page.getByRole('button', { name: 'Предыдущий месяц' }).click();
		await expect(page.locator('.calendar-title')).toHaveText('Январь 2026');
		await expect(page.getByRole('button', { name: 'Предыдущий месяц' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Следующий месяц' })).toBeEnabled();

		await expect(page.getByRole('button', { name: '5 января 2026' })).toBeVisible();
		await expect(page.locator('.calendar-day.has-news')).toHaveCount(1);
	});

	test('Escape закрывает календарь', async ({ page }) => {
		await openIndex(page);
		const dateBtn = page.getByRole('button', { name: /^Дата:/ });
		await dateBtn.click();
		await expect(page.locator('#date-picker-panel')).toBeVisible();
		await page.locator('#date-picker-panel').press('Escape');
		await expect(page.locator('#date-picker-panel')).toBeHidden();
		await expect(dateBtn).toBeFocused();
	});
});
