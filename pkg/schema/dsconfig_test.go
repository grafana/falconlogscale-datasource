package schema_test

import (
	_ "embed"
	"testing"

	"github.com/grafana/dsconfig/schema"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/pluginschema"
	"k8s.io/kube-openapi/pkg/spec3"
)

//go:embed dsconfig.json
var configSchemaJSON []byte

// The editor and the SDK read these additional fields from the same jsonData object.
type jsonSettings struct {
	plugin.JSONSettings
	BaseURL                       string     `json:"baseUrl"`
	DefaultRepository             string     `json:"defaultRepository"`
	DataLinks                     []dataLink `json:"dataLinks"`
	IncrementalQuerying           bool       `json:"incrementalQuerying"`
	IncrementalQueryOverlapWindow string     `json:"incrementalQueryOverlapWindow"`
	EnableSecureSocksProxy        bool       `json:"enableSecureSocksProxy"`
	Timeout                       int        `json:"timeout"`
	TLSAuthWithCACert             bool       `json:"tlsAuthWithCACert"`
	TLSAuth                       bool       `json:"tlsAuth"`
	ServerName                    string     `json:"serverName"`
	TLSSkipVerify                 bool       `json:"tlsSkipVerify"`
}

type dataLink struct {
	Field         string `json:"field"`
	Label         string `json:"label"`
	MatcherRegex  string `json:"matcherRegex"`
	URL           string `json:"url"`
	DatasourceUID string `json:"datasourceUid,omitempty"`
}

//go:generate go test -run TestPlugin -generateArtifacts
func TestPlugin(t *testing.T) {
	schema.RunPluginTests(t, schema.PluginUnderTest{
		ID:                "grafana-falconlogscale-datasource",
		ConfigSchemaJSON:  configSchemaJSON,
		SettingsJSONModel: jsonSettings{},
		SecureKeys: []string{
			"accessToken", "oauth2ClientSecret", "basicAuthPassword",
			"tlsCACert", "tlsClientCert", "tlsClientKey",
		},
		SettingsExamples: &pluginschema.SettingsExamples{
			Examples: map[string]*spec3.Example{
				"logScaleToken": {ExampleProps: spec3.ExampleProps{
					Summary: "LogScale with a personal token",
					Value: map[string]any{
						"url":            "https://cloud.us.humio.com",
						"jsonData":       map[string]any{"authenticateWithToken": true},
						"secureJsonData": map[string]string{"accessToken": "REPLACE_WITH_ACCESS_TOKEN"},
					},
				}},
				"ngsiem": {ExampleProps: spec3.ExampleProps{
					Summary: "NGSIEM with OAuth2 client credentials",
					Value: map[string]any{
						"url": "https://api.crowdstrike.com",
						"jsonData": map[string]any{
							"mode":              "NGSIEM",
							"oauth2":            true,
							"oauth2ClientId":    "REPLACE_WITH_CLIENT_ID",
							"defaultRepository": "search-all",
						},
						"secureJsonData": map[string]string{"oauth2ClientSecret": "REPLACE_WITH_CLIENT_SECRET"},
					},
				}},
			},
		},
	})
}
