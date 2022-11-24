package plugin

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type Settings struct {
	BaseURL               string `json:"baseURL"`
	AccessToken           string `json:"accessToken,omitempty"`
	AuthenticateWithToken bool   `json:"authenticateWithToken,omitempty"`
	GraphqlEndpoint       string
	RestEndpoint          string
}

var (
	errEmptyURL = errors.New("URL can not be blank")
)

func LoadSettings(config backend.DataSourceInstanceSettings) (Settings, error) {
	settings := Settings{}
	if err := json.Unmarshal(config.JSONData, &settings); err != nil {
		return settings, fmt.Errorf("could not unmarshal DataSourceInfo json: %w", err)
	}

	baseURL := config.URL
	settings.BaseURL = baseURL
	if baseURL == "" {
		return Settings{}, errEmptyURL
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

	return settings, nil
}
