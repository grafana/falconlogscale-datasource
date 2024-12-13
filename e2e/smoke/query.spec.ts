import { expect, test } from '@grafana/plugin-e2e';

test.describe('Falcon LogScale queries', () => {
  test('renders editor', async ({ panelEditPage, page, grafanaVersion }) => {
    await panelEditPage.datasource.set('Falcon LogScale');

    await expect(panelEditPage.getQueryEditorRow('A').getByLabel('Query')).toBeVisible();
    await expect(panelEditPage.getQueryEditorRow('A').getByLabel('Repository')).toBeVisible();
  });
});
