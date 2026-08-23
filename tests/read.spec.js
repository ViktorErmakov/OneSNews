const { test, expect } = require('@playwright/test');
const { openIndex, card } = require('./helpers');

async function clickTitle(page, id) {
	const link = card(page, id).locator('.card-title a');
	await link.evaluate((el) => {
		el.addEventListener('click', (event) => event.preventDefault(), { capture: true });
	});
	await link.click();
}

test.describe('Прочитано', () => {
	test('помечает карточку прочитанной по клику на заголовок и сохраняет это', async ({ page }) => {
		await openIndex(page);
		const invoice = card(page, '2026-03-15-001');
		await expect(invoice).not.toHaveClass(/is-read/);
		await clickTitle(page, '2026-03-15-001');
		await expect(invoice).toHaveClass(/is-read/);
		await expect(invoice.locator('.read-badge')).toBeVisible();

		const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ones-read') || '{}'));
		expect(stored['2026-03-15-001']).toEqual(expect.any(Number));

		await page.reload();
		await expect(card(page, '2026-03-15-001')).toHaveClass(/is-read/);
	});

	test('помечает карточку прочитанной средней кнопкой мыши', async ({ page }) => {
		await openIndex(page);
		page.on('popup', (popup) => popup.close());
		await card(page, '2026-03-15-004').locator('.card-title a').click({ button: 'middle' });
		await expect(card(page, '2026-03-15-004')).toHaveClass(/is-read/);
	});
});
