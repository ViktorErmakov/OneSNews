const { test, expect } = require('@playwright/test');
const { openIndex, openAbout } = require('./helpers');

test.describe('Ошибки', () => {
	test('показывает статус, если в индексе нет дат', async ({ page }) => {
		await openIndex(page, {
			index: { site: 'OneS News', dates: [] },
			wait: 'status',
		});
		const status = page.locator('#status');
		await expect(status).toBeVisible();
		await expect(status).toHaveClass(/is-error/);
		await expect(status).toHaveText('Нет опубликованных дней в data/days');
	});

	test('показывает ошибку, если не загрузился список источников', async ({ page }) => {
		await openAbout(page, { sourcesStatus: 500 });
		const message = page.locator('#sources .about-sources-status');
		await expect(message).toHaveClass(/is-error/);
		await expect(message).toHaveText('Не удалось загрузить список источников.');
	});
});
