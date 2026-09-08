const { test, expect } = require('@playwright/test');
const { openIndex, waitForDay, card } = require('./helpers');

test.describe('Оверлей настроек', () => {
	test('шестерёнка открывает панель и закрывает её без смены даты и скролла', async ({ page }) => {
		await openIndex(page);
		await page.locator('#source-picker-btn').click();
		await page.locator('#source-picker-list [data-value="Infostart"]').click();
		await expect(page.locator('article.card')).toHaveCount(1);

		await page.evaluate(() => {
			document.body.style.minHeight = '4000px';
			window.scrollTo(0, 480);
		});
		const scrollY = await page.evaluate(() => window.scrollY);
		expect(scrollY).toBeGreaterThan(100);

		const gearBox = await page.locator('#settings-open').boundingBox();
		expect(gearBox).toBeTruthy();
		await page.mouse.click(gearBox.x + gearBox.width / 2, gearBox.y + gearBox.height / 2);
		await expect(page.locator('#settings-overlay')).toBeVisible();
		await expect(page.locator('#settings-heading')).toHaveText('Настройки');
		await expect(page.locator('#settings-open')).toHaveAttribute('aria-label', 'Закрыть настройки');
		await expect(page.locator('#settings-open')).toHaveAttribute('aria-expanded', 'true');
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page).not.toHaveURL(/settings(?:\.html)/);

		await page.keyboard.press('Escape');
		await expect(page.locator('#settings-overlay')).toBeHidden();
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.getByRole('button', { name: /Источник: Infostart/ })).toBeVisible();
		await expect(page.locator('article.card')).toHaveCount(1);
		expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
	});

	test('кнопка «Лента» закрывает панель', async ({ page }) => {
		await openIndex(page);
		await page.locator('#settings-open').click();
		await expect(page.locator('#settings-overlay')).toBeVisible();
		await page.locator('#settings-close').click();
		await expect(page.locator('#settings-overlay')).toBeHidden();
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
	});

	test('повторный тап по шестерёнке закрывает панель', async ({ page }) => {
		await openIndex(page);
		await page.locator('#settings-open').click();
		await expect(page.locator('#settings-overlay')).toBeVisible();
		await page.locator('#settings-open').click();
		await expect(page.locator('#settings-overlay')).toBeHidden();
	});
});

test.describe('Соседние дни', () => {
	test('слева дата более раннего дня, справа нет ссылки на свежайшем', async ({ page }) => {
		await openIndex(page);
		await expect(page.locator('#another-day-prev')).toHaveText('10 февраля');
		await expect(page.locator('#another-day-next')).toBeHidden();
		await page.locator('#another-day-prev').click();
		await waitForDay(page);
		await expect(page).toHaveURL(/date=2026-02-10/);
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 10 февраля 2026');
		await expect(page.locator('#another-day-prev')).toBeHidden();
		await expect(page.locator('#another-day-next')).toHaveText('15 марта');
	});

	test('справа дата следующих новостей открывает более поздний день', async ({ page }) => {
		await openIndex(page, { path: '/?date=2026-02-10' });
		await expect(page.locator('#another-day-prev')).toBeHidden();
		await expect(page.locator('#another-day-next')).toHaveText('15 марта');
		await page.locator('#another-day-next').click();
		await waitForDay(page);
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page.locator('#day-title')).toHaveText('Дайджест за 15 марта 2026');
	});

	test('в середине архива видны обе даты', async ({ page }) => {
		await openIndex(page, {
			path: '/?date=2026-02-10',
			index: {
				site: 'OneS News',
				dates_by_language: {
					ru: ['2026-03-15', '2026-02-10', '2026-01-05'],
					en: ['2026-03-15'],
				},
			},
		});
		await expect(page.locator('#another-day-prev')).toHaveText('5 января');
		await expect(page.locator('#another-day-next')).toHaveText('15 марта');
	});
});

test.describe('Язык в адресе', () => {
	test('?lang=en показывает английские карточки, даже если язык скрыт', async ({ page }) => {
		await openIndex(page, { path: '/?lang=en', hiddenLanguages: ['en'] });
		await expect(page).toHaveURL(/lang=en/);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
		await expect(card(page, '2026-03-15-005')).toBeVisible();
		await expect(card(page, '2026-03-15-001')).toHaveCount(0);
	});
});

test.describe('Смена языка', () => {
	test('открывает свежайшую дату нового языка', async ({ page }) => {
		await openIndex(page, {
			path: '/?date=2026-02-10',
			index: {
				site: 'OneS News',
				dates_by_language: {
					ru: ['2026-03-15', '2026-02-10'],
					en: ['2026-03-15', '2026-02-10'],
				},
			},
		});
		await expect(page).toHaveURL(/date=2026-02-10/);
		await page.getByRole('button', { name: /Язык:/ }).click();
		await page.locator('#lang-picker-list [data-value="en"]').click();
		await waitForDay(page);
		await expect(page).toHaveURL(/date=2026-03-15/);
		await expect(page).toHaveURL(/lang=en/);
		await expect(card(page, '2026-03-15-004')).toBeVisible();
	});
});
