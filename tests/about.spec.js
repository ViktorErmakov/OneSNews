const { test, expect } = require('@playwright/test');
const { openAbout } = require('./helpers');

test.describe('О проекте', () => {
	test('показывает дисклеймер и ведёт в настройки', async ({ page }) => {
		await openAbout(page);
		await expect(page.locator('h1')).toHaveText('О проекте');
		await expect(page.locator('main.about')).toContainText('не принадлежит');
		await expect(page.locator('main.about')).toContainText('фирме «1С»');
		await expect(page.locator('main.about')).toContainText('только в вашем браузере');
		await expect(page.locator('main.about').getByRole('link', { name: 'настройках' }).first()).toHaveAttribute(
			'href',
			'settings.html',
		);
		await expect(page.locator('#sources')).toHaveCount(0);
	});

	test('из подвала можно вернуться на ленту', async ({ page }) => {
		await openAbout(page);
		await expect(page.locator('footer').getByRole('link', { name: 'Лента' })).toHaveAttribute(
			'href',
			'index.html',
		);
		await expect(page.locator('footer').getByRole('link', { name: 'Настройки' })).toHaveAttribute(
			'href',
			'settings.html',
		);
		await page.locator('footer').getByRole('link', { name: 'Лента' }).click();
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
		await expect(page.locator('article.card')).toHaveCount(5);
	});
});
