# Contributing

## Signed commits are required

> [!IMPORTANT]
> All commits must be [signed](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits) (GPG, SSH, or S/MIME) to be merged into this repository. Pull requests with unsigned commits will need to be re-committed with signatures before they can be merged.

Thank you for your interest in contributing to this repository. We are glad you want help us to improve the project and join our community. Feel free to [browse the open issues](https://github.com/grafana/falconlogscale-datasource/issues). If you wanna more straightforward tasks to complete, [we have some](https://github.com/grafana/falconlogscale-datasource/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22). For more details about how you can help, please take a look at [Grafana's Contributing Guide](https://github.com/grafana/grafana/blob/main/CONTRIBUTING.md).

This project adheres to the [Grafana Code of Conduct](https://github.com/grafana/grafana/blob/main/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

To disclose security issues, refer to [SECURITY](https://github.com/grafana/grafana/blob/main/SECURITY.md).

## Data source configuration schema

The [Falcon LogScale schema](pkg/schema/dsconfig.json) describes each setting, including its type and where Grafana stores it (`root`, `jsonData`, or `secureJsonData`). It reuses the `plugin_sdk_settings` field pack for common settings such as the connection URL. When upgrading dsconfig, keep the tag in the `$schema` URL in sync with the `github.com/grafana/dsconfig/dsconfig` version in `go.mod`. See the [dsconfig field reference](https://github.com/grafana/dsconfig/blob/main/dsconfig/schema.md).

### Changing a setting

1. Update the field in [dsconfig.json](pkg/schema/dsconfig.json). Match its `key`, `target`, and `valueType` to what the plugin reads. For a field shown in the form, add its ID to the appropriate group's `fieldRefs`.
2. For a `jsonData` field read by the backend, update `JSONSettings` in [settings.go](pkg/plugin/settings.go). The schema test reuses this struct. For fields read only by the editor or the Grafana SDK, update `jsonSettings` in [dsconfig_test.go](pkg/schema/dsconfig_test.go). For a secret, add its `secureJsonData` key to `SecureKeys` in the same test.
3. From the repository root, regenerate the schema files and run the conformance test.

   ```shell
   go generate ./pkg/schema/...
   go test ./pkg/schema/...
   ```

Include the regenerated `pkg/schema/*.gen.json` files in the same PR. The plugin build copies them and `dsconfig.json` into `dist/schema/`.

### If the conformance test fails

- `SchemaArtifactInSync` means the generated files are stale. Run the generation command above.
- `JSONDataMatchesStruct` or `JSONDataTypesMatchStruct` means a field name or type differs between the schema and the Go model. Check the JSON tag and Go type against the schema field.
- `SecureValuesMatchLoadSettings` means the schema and `SecureKeys` list different secret names. Check which key the plugin or SDK reads and use that name in both places.
