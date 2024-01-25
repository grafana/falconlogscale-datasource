# Falcon LogScale data source for Grafana

The CrowdStrike Falcon LogScale data source plugin allows you to query and visualize Falcon LogScale data from within Grafana.

## Install the plugin

To install the data source, refer to [Installation](https://grafana.com/grafana/plugins/grafana-falconlogscale-datasource/?tab=installation).

## Configure the data source in Grafana

[Add a data source](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/) by filling in the following fields:

### Basic fields

| Field   | Description                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| Name    | A name for this particular Falcon LogScale data source.                            |
| URL     | Where Falcon LogScale is hosted, for example, `https://cloud.community.humio.com`. |
| Timeout | HTTP request timeout in seconds.                                                   |

### Authentication fields

| Field            | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| Basic auth       | Enter a Falcon LogScale username and password.                                       |
| TLS Client Auth  | Built-in option for authenticating using Transport Layer Security.                   |
| Skip TLS Verify  | Enable to skip TLS verification.                                                     |
| With Credentials | Enable to send credentials such as cookies or auth headers with cross-site requests. |
| With CA Cert     | Enable to verify self-signed TLS Certs.                                              |

Custom HTTP Header Data sources managed by provisioning within Grafana can be configured to add HTTP headers to all requests going to that data source. The header name is configured in the `jsonData` field, and the header value should be configured in secureJsonData. For more information about custom HTTP headers, refer to [Custom HTTP Headers](https://grafana.com/docs/grafana/latest/administration/provisioning/#custom-http-headers-for-data-sources).

### LogScale Token Authentication

You can authenticate using your personal LogScale token. To generate a personal access token, log into LogScale and navigate to User Menu > Manage Account > Personal API Token. Then, set or reset your token. Copy and paste the token into the token field.

### Default LogScale Repository

You can set a default LogScale repository to use for your queries. If you do not specify a default repository, you must select a repository for each query.

### Configure data links

Data links allow you to link to other data sources from your Grafana panels. For more information about data links, refer to [Data links](https://grafana.com/docs/grafana/latest/explore/logs-integration/).

To configure a data link, click the add button in the data links section of the data source configuration page. Fill out the fields as follows:

| Field         | Description                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field         | The field that you want to link to. It can be the exact name or a regex pattern.                                                                                                                        |
| Label         | This provides a meaningful name to the data link.                                                                                                                                                       |
| Regex         | A regular expression to match the field value. If you want the entire value, use `(.*)`                                                                                                                 |
| URL or Query  | A URL link or query provided to a selected data source. You can use variables in the URLs or queries. For more information on data link variables, refer to [Configure data links][configure data link] |
| Internal link | Select this option to link to a Grafana data source.                                                                                                                                                    |

[configure data link]: https://grafana.com/docs/grafana/latest/panels-visualizations/configure-data-links/

### Configure the data source with provisioning

It is possible to configure data sources using configuration files with Grafana’s provisioning system. To read about how it works, including all the settings that you can set for this data source, refer to [Provisioning Grafana data sources](https://grafana.com/docs/grafana/latest/administration/provisioning/#data-sources)

Here are some provisioning examples for this data source using basic authentication:

```yaml
apiVersion: 1
datasources:
  - name: Falcon LogScale
    type: grafana-falconlogscale-datasource
    url: https://cloud.us.humio.com
    jsonData:
      defaultRepository: <defaultRepository or blank>
      authenticateWithToken: true
    secureJsonData:
      accessToken: <accessToken>
```

## Query the data source

The query editor allows you to write LogScale Query Language (LQL) queries. For more information about writing LQL queries, refer to [Query Language Syntax](https://library.humio.com/falcon-logscale/syntax.html). Select a repository from the drop-down menu to query. You will only see repositories that your data source account has access to.

Selecting `$defaultRepo` from the Repository dropdown automatically maps to the default repository configured for the datasource which enables switching between multiple LogScale datasources.

You can use your LogScale saved queries in Grafana. For more information about saved queries, refer to [User Functions](https://library.humio.com/falcon-logscale/syntax-function.html#syntax-function-user).

Here are some useful LQL functions to get you started with Grafana visualizations:

| Function                                                                        | Description                                                                          | Example                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| [timeChart](https://library.humio.com/falcon-logscale/functions-timechart.html) | Groups data into time buckets. This is useful for time series panels.                | `timeChart(span=1h, function=count())` |
| [table](https://library.humio.com/falcon-logscale/functions-table.html)         | Returns a table with the provided fields.                                            | `table([statuscode, responsetime])`    |
| [groupBy](https://library.humio.com/falcon-logscale/functions-groupby.html)     | Group results by field values. This is useful for bar chart, stat, and gauge panels. | `groupBy(_field, function=count())`    |

### Explore view

The Explore view allows you to run LQL queries and visualize the results as logs or charts. For more information about Explore, refer to [Explore](https://grafana.com/docs/grafana/latest/features/explore/). For more information about Logs in Explore, refer to [Explore logs](https://grafana.com/docs/grafana/latest/explore/logs-integration/).

Grafana v9.4.8 and later allows you to create data links in Tempo, Grafana Enterprise Traces, Jaeger, and Zipkin that target Falcon LogScale.

### Templates and variables

To add a new Falcon LogScale query variable, refer to [Add a query variable](https://grafana.com/docs/grafana/latest/variables/variable-types/add-query-variable/). Use your Falcon LogScale data source as your data source. Fill out the query field with your LQL query and select a Repository from the drop-down menu. The template variable will be populated with the first column from the results of your LQL query.

After creating a variable, you can use it in your Falcon LogScale queries using [Variable syntax](https://grafana.com/docs/grafana/latest/variables/syntax/). For more information about variables, refer to [Templates and variables](https://grafana.com/docs/grafana/latest/variables/).

### Import a dashboard for Falcon LogScale

Follow these [instructions](https://grafana.com/docs/grafana/latest/dashboards/export-import/#importing-a-dashboard) for importing a dashboard.

You can find imported dashboards in Configuration > Data Sources > select your Falcon LogScale data source > select the Dashboards tab to see available pre-made dashboards.

## Learn more

- Add [Annotations](https://grafana.com/docs/grafana/latest/dashboards/annotations/).
- Configure and use [Templates and variables](https://grafana.com/docs/grafana/latest/variables/).
- Add [Transformations](https://grafana.com/docs/grafana/latest/panels/transformations/).
- Set up alerting; refer to [Alerts overview](https://grafana.com/docs/grafana/latest/alerting/).
