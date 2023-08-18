package humio_test

import (
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/stretchr/testify/require"
)

func TestRunner(t *testing.T) {
	t.Run("it returns query results", func(t *testing.T) {
		testResult := humio.QueryResult{Cancelled: false, Done: true, Events: []map[string]any{{"field": "value"}}, Metadata: humio.QueryResultMetadata{}}
		jq := TestJobQuerier{id: "testId", queryResult: testResult}
		qr := humio.NewQueryRunner(jq)
		r, err := qr.Run(humio.Query{LSQL: ""}, humio.AuthHeaders{})
		require.Nil(t, err)
		require.Equal(t, testResult, r[0])
	})
	t.Run("it returns repos", func(t *testing.T) {
		repos := []string{"repo1", "repo2"}
		jq := TestJobQuerier{repos: repos}
		qr := humio.NewQueryRunner(jq)
		r, err := qr.GetAllRepoNames(humio.AuthHeaders{})
		require.Nil(t, err)
		require.Equal(t, repos, r)
	})
}

type TestJobQuerier struct {
	id          string
	queryResult humio.QueryResult
	repos       []string
}

func (t TestJobQuerier) CreateJob(repo string, query humio.Query, authHeaders humio.AuthHeaders) (string, error) {
	return t.id, nil
}

func (t TestJobQuerier) DeleteJob(repo string, id string, authHeaders humio.AuthHeaders) error {
	return nil
}

func (t TestJobQuerier) PollJob(repo string, id string, authHeaders humio.AuthHeaders) (humio.QueryResult, error) {
	return t.queryResult, nil
}

func (t TestJobQuerier) ListRepos(authHeaders humio.AuthHeaders) ([]string, error) {
	return t.repos, nil
}
