---
description: This document describes the Falcon LogScale query editor
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: Falcon LogScale query editor
title: Falcon LogScale query editor
weight: 30
version: 0.1
---

# Query the data source

The query editor allows you to write LogScale Query Language (LQL) queries. For more information about writing LQL queries, refer to [Query Language Syntax](https://library.humio.com/falcon-logscale/syntax.html). Select a repository from the drop-down menu to query. You will only see repositories that your data source account has access to.

Selecting `$defaultRepo` from the Repository dropdown automatically maps to the default repository configured for the datasource which enables switching between multiple LogScale datasources.

You can use your LogScale saved queries in Grafana. For more information about saved queries, refer to [User Functions](https://library.humio.com/falcon-logscale/syntax-function.html#syntax-function-user).

Here are some useful LQL functions to get you started with Grafana visualizations:

| Function                                                                        | Description                                                                          | Example                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| [timeChart](https://library.humio.com/falcon-logscale/functions-timechart.html) | Groups data into time buckets. This is useful for time series panels.                | `timeChart(span=1h, function=count())` |
| [table](https://library.humio.com/falcon-logscale/functions-table.html)         | Returns a table with the provided fields.                                            | `table([statuscode, responsetime])`    |
| [groupBy](https://library.humio.com/falcon-logscale/functions-groupby.html)     | Group results by field values. This is useful for bar chart, stat, and gauge panels. | `groupBy(_field, function=count())`    |

## Explore view

The Explore view allows you to run LQL queries and visualize the results as logs or charts. For more information about Explore, refer to [Explore](https://grafana.com/docs/grafana/latest/features/explore/). For more information about Logs in Explore, refer to [Explore logs](https://grafana.com/docs/grafana/latest/explore/logs-integration/).

Grafana v9.4.8 and later allows you to create data links in Tempo, Grafana Enterprise Traces, Jaeger, and Zipkin that target Falcon LogScale. To configure data links, refer to [Configure data links](/docs/plugins/grafana-falconlogscale-datasourcelatest/configure#configure-data-links)