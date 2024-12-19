import { expect, test } from '@grafana/plugin-e2e';
import { selectors } from '../../src/e2e/selectors';

test.describe('Falcon LogScale queries', () => {
  test('renders editor', async ({ panelEditPage }) => {
    await panelEditPage.datasource.set('Falcon LogScale');

    await expect(
      panelEditPage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.queryField.input)
    ).toBeVisible();
    await expect(
      panelEditPage.getQueryEditorRow('A').getByTestId(selectors.components.queryEditor.repository.input)
    ).toBeVisible();
  });
});
