import { expect, test } from '@grafana/plugin-e2e';
import { selectors } from '../../src/e2e/selectors';

test.describe('Falcon LogScale queries', () => {
  test('renders editor', async ({ panelEditPage, readProvisionedDataSource }) => {
    const ds = await readProvisionedDataSource({ fileName: 'logscale.yaml' });
    await panelEditPage.datasource.set(ds.name);

    await expect(
      panelEditPage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.queryField.input)
    ).toBeVisible();
    await expect(
      panelEditPage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.repository.input)
    ).toBeVisible();
  });
});
