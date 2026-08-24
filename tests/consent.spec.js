const { test, expect } = require('@playwright/test');
const { openIndex, openAbout, openPrivacy, metrikaScript } = require('./helpers');

test.describe('Согласие на аналитику', () => {
	test('при первом визите показывает баннер и не грузит Метрику', async ({ page }) => {
		await openIndex(page, { consent: 'none' });
		const banner = page.locator('#consent-banner');
		await expect(banner).toBeVisible();
		await expect(banner.getByRole('button', { name: 'Принять' })).toBeVisible();
		await expect(banner.getByRole('button', { name: 'Отклонить' })).toBeVisible();
		await expect(banner.getByRole('link', { name: 'Подробнее' })).toHaveAttribute(
			'href',
			'settings.html#privacy',
		);
		await expect(metrikaScript(page)).toHaveCount(0);
	});

	test('отклонение скрывает баннер и не подключает счётчик', async ({ page }) => {
		await openIndex(page, { consent: 'none' });
		await page.locator('#consent-banner').getByRole('button', { name: 'Отклонить' }).click();
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(metrikaScript(page)).toHaveCount(0);
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-consent')));
		expect(stored).toEqual({ v: 1, analytics: false });

		await page.reload();
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(metrikaScript(page)).toHaveCount(0);
	});

	test('принятие подключает счётчик и запоминает выбор', async ({ page }) => {
		await openIndex(page, { consent: 'none' });
		await page.locator('#consent-banner').getByRole('button', { name: 'Принять' }).click();
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(metrikaScript(page)).toHaveCount(1);
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-consent')));
		expect(stored).toEqual({ v: 1, analytics: true });

		await page.reload();
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(metrikaScript(page)).toHaveCount(1);
	});

	test('тема и прочитанное работают без согласия на аналитику', async ({ page }) => {
		await openIndex(page, { consent: 'none' });
		await expect(page.locator('#consent-banner')).toBeVisible();
		await page.locator('#theme-toggle').click();
		expect(await page.evaluate(() => localStorage.getItem('ones-theme'))).toMatch(/light|dark/);

		const link = page.locator('article.card .card-title a').first();
		await link.evaluate((el) => {
			el.addEventListener('click', (event) => event.preventDefault(), { capture: true });
		});
		await link.click();
		const readMap = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-read') || '{}'));
		expect(Object.keys(readMap).length).toBeGreaterThan(0);
		await expect(metrikaScript(page)).toHaveCount(0);
	});
});

test.describe('Конфиденциальность', () => {
	test('описывает локальное хранение и даёт сменить выбор', async ({ page }) => {
		await openPrivacy(page, { consent: 'none' });
		await expect(page.locator('main.about')).toContainText('ones-read');
		await expect(page.locator('main.about')).toContainText('ones-search-history');
		await expect(page.locator('main.about')).toContainText('ones-hidden-sources');
		await expect(page.locator('main.about')).toContainText('только после кнопки «Принять»');
		await expect(page.locator('#consent-status')).toContainText('не сделали выбор');
		await expect(metrikaScript(page)).toHaveCount(0);

		await page.locator('#consent-banner').getByRole('button', { name: 'Принять' }).click();
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(page.locator('#consent-status')).toContainText('включена');
		await expect(metrikaScript(page)).toHaveCount(1);
	});

	test('на странице политики можно включить аналитику без баннера', async ({ page }) => {
		await openPrivacy(page);
		await expect(page.locator('#consent-banner')).toHaveCount(0);
		await expect(page.locator('#consent-status')).toContainText('выключена');
		await page.getByRole('button', { name: 'Включить аналитику' }).click();
		await expect(page.locator('#consent-status')).toContainText('включена');
		await expect(metrikaScript(page)).toHaveCount(1);
	});

	test('из подвала ленты открываются настройки с политикой', async ({ page }) => {
		await openIndex(page);
		await page.locator('footer').getByRole('link', { name: 'Настройки' }).click();
		await expect(page.locator('h1')).toHaveText('Настройки');
		await expect(page.locator('#privacy')).toBeVisible();
	});

	test('privacy.html перенаправляет к разделу конфиденциальности', async ({ page }) => {
		await openPrivacy(page, { path: '/privacy.html' });
		await expect(page).toHaveURL(/settings(?:\.html)?#privacy/);
		await expect(page.locator('#privacy-heading')).toHaveText('Конфиденциальность');
	});
});
