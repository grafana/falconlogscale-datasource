import { expect, test } from '@grafana/plugin-e2e';
import { selectors } from '../../src/e2e/selectors';

test('renders the config editor', async ({ createDataSourceConfigPage, page }) => {
  const configPage = await createDataSourceConfigPage({
    type: 'grafana-falconlogscale-datasource',
  });

  await expect(page.getByText('LogScale Token Authentication')).toBeVisible();
  await expect(page.getByTestId(selectors.components.configEditor.defaultRepository.input)).toBeVisible();
  await expect(page.getByTestId(selectors.components.configEditor.loadRepositories.button)).toBeVisible();
});
