package plugin

import (
	"encoding/json"
	"errors"
	"fmt"
	"strconv"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

type Settings struct {
	BaseURL               string   `json:"baseURL"`
	AccessToken           string   `json:"accessToken,omitempty"`
	AuthenticateWithToken bool     `json:"authenticateWithToken,omitempty"`
	KeepCookies           []string `json:"keepCookies,omitempty"`
	//Timeout               uint     `json:"timeout,omitempty"`
	GraphqlEndpoint string
	RestEndpoint    string
	BasicAuthUser   string
	BasicAuthPass   string

	InsecureSkipVerify bool `json:"tlsSkipVerify,omitempty"`
	TlsClientAuth      bool `json:"tlsAuth,omitempty"`
	TlsAuthWithCACert  bool `json:"tlsAuthWithCACert,omitempty"`
	TlsCACert          string
	TlsClientCert      string
	TlsClientKey       string
	TlsServerName      string
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

	settings.BasicAuthUser = config.BasicAuthUser
	settings.BasicAuthPass = secureSettings["basicAuthPassword"]

	return loadTlsSettings(config, settings)
}

func loadTlsSettings(config backend.DataSourceInstanceSettings, settings Settings) (Settings, error) {
	var jsonData map[string]interface{}
	if err := json.Unmarshal(config.JSONData, &jsonData); err != nil {
		return settings, fmt.Errorf("%s: could not parse json", err.Error())
	}

	if jsonData["tlsSkipVerify"] != nil {
		if tlsSkipVerify, ok := jsonData["tlsSkipVerify"].(string); ok {
			var err error
			settings.InsecureSkipVerify, err = strconv.ParseBool(tlsSkipVerify)
			if err != nil {
				return settings, fmt.Errorf("could not parse tlsSkipVerify value: %w", err)
			}
		} else {
			settings.InsecureSkipVerify = jsonData["tlsSkipVerify"].(bool)
		}
	}

	if jsonData["tlsAuth"] != nil {
		if tlsAuth, ok := jsonData["tlsAuth"].(string); ok {
			var err error
			settings.TlsClientAuth, err = strconv.ParseBool(tlsAuth)
			if err != nil {
				return settings, fmt.Errorf("could not parse tlsAuth value: %w", err)
			}
		} else {
			settings.TlsClientAuth = jsonData["tlsAuth"].(bool)
		}
	}

	if jsonData["tlsAuthWithCACert"] != nil {
		if tlsAuthWithCACert, ok := jsonData["tlsAuthWithCACert"].(string); ok {
			var err error
			settings.TlsAuthWithCACert, err = strconv.ParseBool(tlsAuthWithCACert)
			if err != nil {
				return settings, fmt.Errorf("could not parse tlsAuthWithCACert value: %w", err)
			}
		} else {
			settings.TlsAuthWithCACert = jsonData["tlsAuthWithCACert"].(bool)
		}
	}

	if jsonData["serverName"] != nil {
		settings.TlsServerName = jsonData["serverName"].(string)
	}

	if tlsCACert, ok := config.DecryptedSecureJSONData["tlsCACert"]; ok {
		settings.TlsCACert = tlsCACert
	}

	if tlsClientCert, ok := config.DecryptedSecureJSONData["tlsClientCert"]; ok {
		settings.TlsClientCert = tlsClientCert
	}

	if tlsClientKey, ok := config.DecryptedSecureJSONData["tlsClientKey"]; ok {
		settings.TlsClientKey = tlsClientKey
	}

	return settings, nil
}
