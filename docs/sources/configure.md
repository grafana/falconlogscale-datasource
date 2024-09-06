---
description: This document outlines configuration options for the Falcon LogScale data source
labels:
products:
  - Grafana Cloud
keywords:
  - data source
menuTitle: Configure the Falcon LogScale data source
title: Falcon LogScale data source
weight: 20
version: 0.1
---

# Configure the Falcon LogScale data source

[Add a data source](https://grafana.com/docs/grafana/latest/datasources/add-a-data-source/) by filling in the following fields:

## Basic fields

| Field   | Description                                                                        |
| ------- | ---------------------------------------------------------------------------------- |
| Name    | A name for this particular Falcon LogScale data source.                            |
| URL     | Where Falcon LogScale is hosted, for example, `https://cloud.community.humio.com`. |
| Timeout | HTTP request timeout in seconds.                                                   |

## Authentication fields

| Field            | Description                                                                          |
| ---------------- | ------------------------------------------------------------------------------------ |
| Basic auth       | Enter a Falcon LogScale username and password.                                       |
| TLS Client Auth  | Built-in option for authenticating using Transport Layer Security.                   |
| Skip TLS Verify  | Enable to skip TLS verification.                                                     |
| With Credentials | Enable to send credentials such as cookies or auth headers with cross-site requests. |
| With CA Cert     | Enable to verify self-signed TLS Certs.                                              |

Custom HTTP Header Data sources managed by provisioning within Grafana can be configured to add HTTP headers to all requests going to that data source. The header name is configured in the `jsonData` field, and the header value should be configured in secureJsonData. For more information about custom HTTP headers, refer to [Custom HTTP Headers](https://grafana.com/docs/grafana/latest/administration/provisioning/#custom-http-headers-for-data-sources).

## LogScale Token Authentication

You can authenticate using your personal LogScale token. To generate a personal access token, log into LogScale and navigate to User Menu > Manage Account > Personal API Token. Then, set or reset your token. Copy and paste the token into the token field.

# Forward OAuth Identity

**Note: This feature is experimental, which means it may not work as expected, it may cause Grafana to behave in an unexpected way, and breaking changes may be introduced in the future.**

## Prerequisites

OAuth identity forwarding is only possible with a self-hosted LogScale instance appropriately configured with the same OAuth provider as Grafana. Not all OAuth/OIDC configurations may be supported currently.

With this authentication method enabled, a token will not need to be provided to make use of a LogScale data source. Instead, users that are logged in to Grafana with the same OAuth provider as the LogScale instance will have their token forwarded to the data source and that will be used to authenticate any requests.

**Note: Some Grafana features will not function as expected e.g. alerting. Grafana backend features require credentials to always be in scope which will not be the case with this authentication method.**

## Default LogScale Repository

You can set a default LogScale repository to use for your queries. If you do not specify a default repository, you must select a repository for each query.

## Configure data links

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

## Configure the data source with provisioning

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

## Import a dashboard for Falcon LogScale

Follow these [instructions](https://grafana.com/docs/grafana/latest/dashboards/export-import/#importing-a-dashboard) for importing a dashboard.

You can find imported dashboards in Configuration > Data Sources > select your Falcon LogScale data source > select the Dashboards tab to see available pre-made dashboards.
