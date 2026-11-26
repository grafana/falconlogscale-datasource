package plugin

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// JSONSettings contains the jsonData fields used by the backend.
type JSONSettings struct {
	AuthenticateWithToken bool     `json:"authenticateWithToken,omitempty"`
	KeepCookies           []string `json:"keepCookies,omitempty"`
	OAuthPassThru         bool     `json:"oauthPassThru,omitempty"`
	OAuth2                bool     `json:"oauth2,omitempty"`
	OAuth2ClientID        string   `json:"oauth2ClientId,omitempty"`
	Mode                  string   `json:"mode,omitempty"`
}

type Settings struct {
	JSONSettings
	BaseURL            string `json:"baseURL"`
	AccessToken        string `json:"accessToken,omitempty"`
	OAuth2ClientSecret string `json:"oauth2ClientSecret,omitempty"`
	GraphqlEndpoint    string
	RestEndpoint       string
	BasicAuthUser      string
	BasicAuthPass      string
}

var (
	errEmptyURL = errors.New("URL can not be blank")
)

func LoadSettings(config backend.DataSourceInstanceSettings) (Settings, error) {
	settings := Settings{}
	if err := json.Unmarshal(config.JSONData, &settings); err != nil {
		return settings, backend.DownstreamError(fmt.Errorf("could not unmarshal DataSourceInfo json: %w", err))
	}

	baseURL := config.URL
	settings.BaseURL = baseURL
	if baseURL == "" {
		return Settings{}, backend.DownstreamError(errEmptyURL)
	}

	if settings.AuthenticateWithToken {
		settings.GraphqlEndpoint = baseURL + "/humio/graphql"
		settings.RestEndpoint = baseURL + "/humio"
	} else {
		settings.GraphqlEndpoint = baseURL + "/graphql"
		settings.RestEndpoint = baseURL
	}

	secureSettings := config.DecryptedSecureJSONData
	if secureSettings == nil {
		secureSettings = make(map[string]string)
	}
	settings.AccessToken = secureSettings["accessToken"]
	settings.OAuth2ClientSecret = secureSettings["oauth2ClientSecret"]

	settings.BasicAuthUser = config.BasicAuthUser
	settings.BasicAuthPass = secureSettings["basicAuthPassword"]

	return settings, nil
}
