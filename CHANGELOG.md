# Changelog

## 1.7.5

- Dependency updates.
  
## 1.7.4

- Dependency updates.
- PDC support.
  
## 1.7.3

- Dependency updates.

## 1.7.2

- Dependency updates.
- Add `errorsource` [#380](https://github.com/grafana/falconlogscale-datasource/pull/380)
  
## 1.7.1

- Dependency updates.
  
## 1.7.0

- Feature: Upgrade `VariableEditor` to remove usage of deprecated APIs and add `repository` variable query type. [#303](https://github.com/grafana/falconlogscale-datasource/pull/303)
- Dependency updates.
  
## 1.6.0

- Fix: State bug in `VariableEditor`
- Dependency updates.
  
## 1.5.0

- Experimental: Support OAuth token forwarding for authentication. See [here](https://github.com/grafana/falconlogscale-datasource?tab=readme-ov-file#forward-oauth-identity) for further details.
- Dependency updates.

## 1.4.1

- Prepend `@timestamp` field to ensure it is always used as the timestamp value in the logs visualization.
- Dependency updates.
  
## 1.4.0

- Add $defaultRepo option to Repository dropdown.
- Other minor dependency updates

## 1.3.1

- Error message is more descriptive when a repository has not been selected.

## 1.3.0

- Bump github.com/grafana/grafana-plugin-sdk-go from 0.180.0 to 0.195.0
- Other minor dependency updates

## 1.2.0

- Bug: Issue where users were unable to select default repository is fixed.

## 1.1.0

- Minimum Grafana required version is now **9.5.0**
- Logs in explore view can be filtered by a value or filtered out by a value.
- The settings UI has been overhauled to use the new Grafana form and authentication components.

## 1.0.1

- Bug: TLS option are now correctly passed to the LogScale client.

## 1.0.0

- Documentation
- A default repository can be selected in the data source config.
- Support added for abstract queries.
- Fields are ordered according to meta-data response from LogScale. '@rawString' is always the first field.
- Log view is the default option in Explore.
- Grafana data frames are converted to wide format when using a LogScale group by function to support multiline time series.
- Bug: Data links do not throw an error if there is not a matching log.

## 0.1.0 (Unreleased)

- Logs in explore view
- Data links from LogScale logs to traces
- Bug: Remove unused auth options
- Bug: DataFrame types will be correctly converted when the first field is nil

## 0.0.0 (Unreleased)

Initial release.
