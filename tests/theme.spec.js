const { test, expect } = require('@playwright/test');
const { openIndex, openAbout } = require('./helpers');

test.describe('Тема', () => {
	test('переключает светлую и тёмную тему на ленте и сохраняет её', async ({ page }) => {
		await openIndex(page);
		const root = page.locator('html');
		const initial = await root.getAttribute('data-theme');
		expect(initial === 'light' || initial === 'dark').toBeTruthy();

		const next = initial === 'dark' ? 'light' : 'dark';
		await page.locator('#theme-toggle').click();
		await expect(root).toHaveAttribute('data-theme', next);
		await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', next);

		const stored = await page.evaluate(() => localStorage.getItem('ones-theme'));
		expect(stored).toBe(next);

		const pressed = next === 'dark' ? 'true' : 'false';
		await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-pressed', pressed);

		await page.reload();
		await expect(root).toHaveAttribute('data-theme', next);
	});

	test('переключатель темы работает на странице настроек', async ({ page }) => {
		await openAbout(page);
		const root = page.locator('html');
		const initial = await root.getAttribute('data-theme');
		const next = initial === 'dark' ? 'light' : 'dark';
		await page.locator('#theme-toggle').click();
		await expect(root).toHaveAttribute('data-theme', next);
		expect(await page.evaluate(() => localStorage.getItem('ones-theme'))).toBe(next);
	});
});
