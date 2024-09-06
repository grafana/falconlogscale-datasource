---
description: This document describes using templates and variables with Falcon LogScale
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: Falcon LogScale templates and variables
title: Falcon LogScale templates and variables
weight: 40
version: 0.1
---

### Falcon LogScale templates and variables

To add a new Falcon LogScale query variable, refer to [Add a query variable](https://grafana.com/docs/grafana/latest/variables/variable-types/add-query-variable/). Use your Falcon LogScale data source as your data source. Fill out the query field with your LQL query and select a Repository from the drop-down menu. The template variable will be populated with the first column from the results of your LQL query.

After creating a variable, you can use it in your Falcon LogScale queries using [Variable syntax](https://grafana.com/docs/grafana/latest/variables/syntax/). For more information about variables, refer to [Templates and variables](https://grafana.com/docs/grafana/latest/variables/).

For an introduction to templates and variables, see the following topics:

- [Variables](https://grafana.com/docs/grafana/latest/dashboards/variables/)
- [Templates](https://grafana.com/docs/grafana/latest/dashboards/variables/#templates)
- [Add and manage variables](https://grafana.com/docs/grafana/latest/dashboards/variables/add-template-variables/)
- [Variable syntax](https://grafana.com/docs/grafana/latest/dashboards/variables/variable-syntax/)