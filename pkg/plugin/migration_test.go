package plugin_test

import (
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/plugin"
	"github.com/stretchr/testify/require"
)

func preMigrationQuery() humio.Query {
	return humio.Query{
		LSQL: "test query",
	}
}

func TestMigrateQuery(t *testing.T) {
	t.Run("migrates request to have default queryType", func(t *testing.T) {
		preMigration := preMigrationQuery()
		migratedQuery := plugin.MigrateRequest(preMigration)

		require.Equal(t, migratedQuery.QueryType, humio.QueryTypeLQL)
	})

	t.Run("migrates request to have default formatAs", func(t *testing.T) {
		preMigration := preMigrationQuery()
		migratedQuery := plugin.MigrateRequest(preMigration)

		require.Equal(t, migratedQuery.FormatAs, humio.FormatMetrics)
	})

}
