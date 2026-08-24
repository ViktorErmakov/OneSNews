const { test, expect } = require('@playwright/test');
const { openAbout } = require('./helpers');

test.describe('О проекте', () => {
	test('показывает дисклеймер и группирует источники по языку и типу', async ({ page }) => {
		await openAbout(page);
		await expect(page.locator('h1')).toHaveText('О проекте');
		await expect(page.locator('main.about')).toContainText('не принадлежит');
		await expect(page.locator('main.about')).toContainText('фирме «1С»');
		await expect(page.locator('main.about')).toContainText('только в вашем браузере');
		await expect(page.locator('main.about').getByRole('link', { name: 'Конфиденциальность' })).toHaveAttribute(
			'href',
			'privacy.html',
		);

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
	});

	test('из подвала можно вернуться на ленту', async ({ page }) => {
		await openAbout(page);
		await expect(page.locator('footer').getByRole('link', { name: 'Лента' })).toHaveAttribute(
			'href',
			'index.html',
		);
		await page.locator('footer').getByRole('link', { name: 'Лента' }).click();
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
		await expect(page.locator('article.card')).toHaveCount(5);
	});
});
