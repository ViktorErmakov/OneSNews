const { test, expect } = require('@playwright/test');
const { openAbout, openSettings } = require('./helpers');

test.describe('Настройки', () => {
	test('about.html перенаправляет на объединённую страницу с дисклеймером', async ({ page }) => {
		await openAbout(page);
		await expect(page).toHaveURL(/settings(?:\.html)?(?:#.*)?$/);
		await expect(page.locator('h1')).toHaveText('Настройки');
		await expect(page.locator('#about')).toContainText('не принадлежит');
		await expect(page.locator('#about')).toContainText('фирме «1С»');
		await expect(page.locator('#sources')).toBeVisible();
	});

	test('из подвала можно вернуться на ленту', async ({ page }) => {
		await openSettings(page);
		await expect(page.locator('footer').getByRole('link', { name: 'Лента' })).toHaveAttribute(
			'href',
			'index.html',
		);
		await page.locator('footer').getByRole('link', { name: 'Лента' }).click();
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
		await expect(page.locator('article.card')).toHaveCount(5);
	});
});
