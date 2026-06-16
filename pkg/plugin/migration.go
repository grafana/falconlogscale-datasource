package plugin

import (
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
)

func MigrateRequest(query humio.Query) humio.Query {
	// Legacy queries did not have a QueryType field
	if query.QueryType == "" {
		query.QueryType = humio.QueryTypeLQL
	}

	// Legacy queries did not have a FormatAs field
	if query.FormatAs == "" {
		query.FormatAs = humio.FormatMetrics
	}

	return query
}
