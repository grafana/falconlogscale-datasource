package models

import (
	"encoding/json"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

// QueryContext the context of the query
type QueryContext struct {
	Query backend.DataQuery
	Model QueryModel
}

// QueryModel entry model for the query
type QueryModel struct {
	Query      string `json:"query"`
	Repository string `json:"repository"`
	Type       string `json:"type"`
}

// ReadQuery will read and validate Settings from the DataSourceConfig
func ReadQuery(query backend.DataQuery) (QueryModel, error) {
	model := QueryModel{}
	if err := json.Unmarshal(query.JSON, &model); err != nil {
		return model, fmt.Errorf("could not read query: %w", err)
	}
	return model, nil
}
