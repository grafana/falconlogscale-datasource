package plugin

import (
	"fmt"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/require"
)

func TestLoadSettings(t *testing.T) {
	t.Run("should return error when URL is empty", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			URL:      "",
			JSONData: []byte(`{}`),
		}

		_, err := LoadSettings(config)
		require.Error(t, err)
		require.ErrorIs(t, err, backend.DownstreamError(errEmptyURL))
	})

	t.Run("should not return error when URL is not empty", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			URL:      "http://localhost:8080",
			JSONData: []byte(`{}`),
		}

		_, err := LoadSettings(config)
		require.NoError(t, err)
	})

	t.Run("should return error when JSONData cannot be unmarshaled", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			URL:      "http://localhost:8080",
			JSONData: []byte(`{invalid json}`),
		}

		_, err := LoadSettings(config)
		require.Error(t, err)
		require.ErrorIs(t, err, backend.DownstreamError(fmt.Errorf("could not unmarshal DataSourceInfo json: %w", err)))
	})

	t.Run("should load settings successfully with valid config", func(t *testing.T) {
		config := backend.DataSourceInstanceSettings{
			URL:      "http://localhost:8080",
			JSONData: []byte(`{"authenticateWithToken": true}`),
		}

		settings, err := LoadSettings(config)
		require.NoError(t, err)
		require.Equal(t, "http://localhost:8080", settings.BaseURL)
		require.Equal(t, "http://localhost:8080/humio/graphql", settings.GraphqlEndpoint)
		require.Equal(t, "http://localhost:8080/humio", settings.RestEndpoint)
	})
}
