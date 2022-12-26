package plugin_test

import (
	"context"
	"errors"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/stretchr/testify/require"
)

func TestCheckHealth(t *testing.T) {
	t.Run("HealthStatusOK when settings are valid and API returns 200 and no error", func(t *testing.T) {
		handler, tc := setup()
		tc.falconClient.err = nil

		res, _ := handler.CheckHealth(
			context.Background(),
			&backend.CheckHealthRequest{},
		)

		require.Equal(t, backend.HealthStatusOk, res.Status)
		require.Equal(t, "Data source is working", res.Message)
	})

	t.Run("HealthStatusError when settings are valid and API returns error", func(t *testing.T) {
		handler, tc := setup()
		tc.falconClient.err = errors.New("some error")

		res, _ := handler.CheckHealth(
			context.Background(),
			&backend.CheckHealthRequest{},
		)

		require.Equal(t, backend.HealthStatusError, res.Status)
		require.Equal(t, "some error", res.Message)
	})
}
