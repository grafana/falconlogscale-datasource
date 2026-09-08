import { expect, test } from '@grafana/plugin-e2e';
import { selectors } from '../../src/e2e/selectors';

test.describe('Falcon LogScale queries', () => {
  test('renders editor', async ({ explorePage, readProvisionedDataSource }) => {
    const ds = await readProvisionedDataSource({ fileName: 'logscale.yaml' });
    await explorePage.datasource.set(ds.name);

    await expect(
      explorePage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.queryField.input)
    ).toBeVisible();
    await expect(
      explorePage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.repository.input)
    ).toBeVisible();
  });
});
