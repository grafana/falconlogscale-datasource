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
		tc.queryRunner.viewsErr = nil

		res, _ := handler.CheckHealth(
			context.Background(),
			&backend.CheckHealthRequest{},
		)

		require.Equal(t, backend.HealthStatusOk, res.Status)
		require.Equal(t, "Successfully authenticated (0 repositories found)", res.Message)
	})

	t.Run("HealthStatusError when settings are valid and API returns error", func(t *testing.T) {
		handler, tc := setup()
		tc.queryRunner.viewsErr = errors.New("some error")

		res, _ := handler.CheckHealth(
			context.Background(),
			&backend.CheckHealthRequest{},
		)

		require.Equal(t, backend.HealthStatusError, res.Status)
		require.Equal(t, "Authentication failed: some error", res.Message)
	})
}
