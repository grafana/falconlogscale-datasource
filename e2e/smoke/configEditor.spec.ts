import { expect, test } from '@grafana/plugin-e2e';

test('renders the config editor', async ({ createDataSourceConfigPage, page }) => {
  const configPage = await createDataSourceConfigPage({
    type: 'grafana-falconlogscale-datasource',
  });

  await expect(page.getByText('LogScale Token Authenticatoin')).toBeVisible();
  await expect(page.getByText('Default Repository')).toBeVisible();
});
