# Changelog

## 1.0.0

- Documentation
- A default repository can be selected in the data source config.
- Support added for abstract queries.
- Fields are ordered according to meta-data response from LogScale. '@rawString' is always the first field.
- Logo is not official Falcon LogScale logo
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
