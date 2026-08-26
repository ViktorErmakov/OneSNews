const { test, expect } = require('@playwright/test');
const { openSettings, waitForDay, card } = require('./helpers');

test.describe('Настройки', () => {
	test('группирует источники по языку и типу и даёт ссылки', async ({ page }) => {
		await openSettings(page);
		await expect(page.locator('h1')).toHaveText('Настройки');
		await expect(page.locator('#about')).toContainText('не принадлежит');

		const langs = page.locator('.about-lang');
		await expect(langs).toHaveCount(2);
		await expect(langs.nth(0).locator('.about-lang-title')).toHaveText('Русский');
		await expect(langs.nth(1).locator('.about-lang-title')).toHaveText('English');
		await expect(page.getByRole('checkbox', { name: 'Русский' })).toBeChecked();
		await expect(page.locator('input[data-lang="en"]')).not.toBeChecked();

		await expect(langs.nth(0).locator('.about-type-title')).toHaveText(['Сайты', 'Telegram']);
		await expect(langs.nth(1).locator('.about-type-title')).toHaveText(['Сайты', 'Видеохостинги']);
		await expect(langs.nth(1).locator('input[data-type]').first()).toBeDisabled();
		await expect(langs.nth(1).locator('input[data-source]').first()).toBeDisabled();

		const habr = page.getByRole('link', { name: 'Habr 1C' });
		await expect(habr).toHaveAttribute('href', 'https://habr.com/ru/hubs/1c/');
		await expect(habr).toHaveAttribute('target', '_blank');
		await expect(habr).toHaveAttribute('rel', 'noopener noreferrer');

		await expect(page.getByRole('link', { name: 'Example YouTube' })).toHaveAttribute(
			'href',
			'https://www.youtube.com/channel/CHANNEL_ID',
		);

		await expect(page.locator('.about-sources')).toContainText('Галочка у языка');
		await expect(page.locator('.about-sources')).toContainText('Фильтр на главной');
		await expect(page.getByRole('checkbox', { name: 'Сайты' }).first()).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Telegram' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Infostart' })).toBeChecked();
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeEnabled();
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-languages') || '[]'))).toEqual([
			'en',
		]);
	});

	test('снятие галочки скрывает карточки источника на ленте', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Infostart' }).uncheck();
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-sources') || '[]'));
		expect(stored).toEqual(['Infostart']);
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeEnabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
		await expect(card(page, '2026-03-15-002')).toBeVisible();

		await page.getByRole('button', { name: /Источник:/ }).click();
		await expect(page.locator('#source-picker-list [data-value="Infostart"]')).toHaveCount(0);
		await expect(page.locator('#source-picker-list [role="option"]').first().locator('.picker-count')).toHaveText(
			'2',
		);
	});

	test('снятие галочки категории скрывает все её источники на ленте', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Telegram' }).uncheck();
		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-types') || '[]'));
		expect(stored).toEqual(['telegram']);
		await expect(page.getByRole('checkbox', { name: 'Игорь Апресов | Radio Ingvar' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeEnabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-003')).toHaveCount(0);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(page.locator('#section-telegram')).toHaveCount(0);
	});

	test('«Показать все» возвращает скрытые источники', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Infostart' }).uncheck();
		await page.getByRole('checkbox', { name: 'Telegram' }).uncheck();
		await page.getByRole('button', { name: 'Показать все' }).click();
		await expect(page.getByRole('checkbox', { name: 'Infostart' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Telegram' })).toBeChecked();
		await expect(page.getByRole('checkbox', { name: 'Игорь Апресов | Radio Ingvar' })).toBeEnabled();
		expect(await page.evaluate(() => localStorage.getItem('ones-hidden-sources'))).toBeNull();
		expect(await page.evaluate(() => localStorage.getItem('ones-hidden-types'))).toBeNull();
		expect(await page.evaluate(() => localStorage.getItem('ones-hidden-languages'))).toBe('[]');
		await expect(page.locator('input[data-lang="en"]')).toBeChecked();
		await expect(page.getByRole('button', { name: 'Показать все' })).toBeDisabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(3);
		await expect(card(page, '2026-03-15-001')).toBeVisible();
		await expect(card(page, '2026-03-15-003')).toBeVisible();
	});

	test('если скрыты все источники дня, лента показывает пустое состояние', async ({ page }) => {
		await openSettings(page);
		const typeBoxes = page.locator('#sources input[data-type]:not([disabled])');
		const count = await typeBoxes.count();
		for (let i = 0; i < count; i += 1) {
			await typeBoxes.nth(i).uncheck();
		}

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(0);
		await expect(page.locator('.empty-lead')).toHaveText('Вы скрыли источники за этот день.');
		await expect(page.locator('.empty-hint a')).toHaveAttribute('href', 'settings.html#sources-heading');
		await expect(page.locator('#source-picker')).toBeHidden();
	});

	test('переключает настройки на английский', async ({ page }) => {
		await openSettings(page);
		await page.locator('#lang-picker-btn').click();
		await page.locator('#lang-picker-list [data-value="en"]').click();
		await expect(page.locator('h1')).toHaveText('Settings');
		await expect(page.locator('#about')).toContainText('not affiliated');
		await expect(page.getByRole('button', { name: 'Show all' })).toBeVisible();
		await expect(page.locator('#privacy-heading')).toHaveText('Privacy');
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
		await expect(page.locator('input[data-lang="en"]')).toBeChecked();
		await expect(page.locator('.about-lang').nth(1).locator('input[data-type]').first()).toBeEnabled();
	});

	test('галочка языка выключает группу и скрывает карточки на ленте', async ({ page }) => {
		await openSettings(page);
		await page.getByRole('checkbox', { name: 'Русский' }).uncheck();
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-languages') || '[]'))).toEqual([
			'en',
			'ru',
		]);
		await expect(page.getByRole('checkbox', { name: 'Telegram' })).toBeDisabled();
		await expect(page.getByRole('checkbox', { name: 'Infostart' })).toBeDisabled();

		await page.goto('/');
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(0);
		await expect(page.locator('.empty-lead')).toHaveText('Вы скрыли источники за этот день.');
		await expect(page.locator('.empty-hint a')).toHaveAttribute('href', 'settings.html#sources-heading');
	});

	test('включение чужого языка открывает его группу', async ({ page }) => {
		await openSettings(page);
		await page.locator('input[data-lang="en"]').check();
		const english = page.locator('.about-lang').nth(1);
		await expect(english.locator('input[data-type]').first()).toBeEnabled();
		await expect(page.getByRole('checkbox', { name: 'Example YouTube' })).toBeEnabled();
		expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ones-hidden-languages') || '[]'))).toEqual([]);

		await page.goto('/');
		await waitForDay(page);
		await page.locator('#lang-picker-btn').click();
		await page.locator('#lang-picker-list [data-value="en"]').click();
		await waitForDay(page);
		await expect(page.locator('article.card')).toHaveCount(2);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-005')).toBeVisible();
	});
});
