const fs = require('fs');

const reportPath = process.argv[2] || 'test-results/results.json';
const lines = ['## Отчёт тестов', ''];

if (!fs.existsSync(reportPath)) {
	lines.push('Файл отчёта `test-results/results.json` не найден.');
} else {
	const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
	const stats = report.stats || {};
	const passed = stats.expected || 0;
	const failed = stats.unexpected || 0;
	const flaky = stats.flaky || 0;
	const skipped = stats.skipped || 0;
	lines.push(`- Прошло: **${passed}**`);
	lines.push(`- Упало: **${failed}**`);
	lines.push(`- Нестабильно: **${flaky}**`);
	lines.push(`- Пропущено: **${skipped}**`);
	lines.push('');
	lines.push(failed ? '**Результат: есть падения.**' : '**Результат: все тесты прошли.**');
}

const text = `${lines.join('\n')}\n`;
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
	fs.appendFileSync(summaryFile, text);
} else {
	process.stdout.write(text);
}
