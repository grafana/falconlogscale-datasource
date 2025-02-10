package humio_test

import (
	"context"
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/stretchr/testify/require"
)

func TestRunner(t *testing.T) {
	t.Run("it returns query results", func(t *testing.T) {
		testResult := humio.QueryResult{Cancelled: false, Done: true, Events: []map[string]any{{"field": "value"}}, Metadata: humio.QueryResultMetadata{}}
		jq := TestJobQuerier{id: "testId", queryResult: testResult}
		qr := humio.NewQueryRunner(jq)
		r, err := qr.Run(humio.Query{LSQL: ""})
		require.Nil(t, err)
		require.Equal(t, testResult, r[0])
	})
	t.Run("it returns repos", func(t *testing.T) {
		repos := []string{"repo1", "repo2"}
		jq := TestJobQuerier{repos: repos}
		qr := humio.NewQueryRunner(jq)
		r, err := qr.GetAllRepoNames()
		require.Nil(t, err)
		require.Equal(t, repos, r)
	})
	t.Run("it returns on a result on the channel", func(t *testing.T) {
		repos := []string{"repo1", "repo2"}
		q := humio.Query{}
		jq := TestJobQuerier{repos: repos}
		qr := humio.NewQueryRunner(jq)
		c := make(chan humio.StreamingResults)
		qr.RunChannel(context.Background(), q, c)
		result := <-c
		expected := humio.StreamingResults{}
		require.Equal(t, expected, result)
	})
}

type TestJobQuerier struct {
	id          string
	queryResult humio.QueryResult
	repos       []string
}

// Stream implements humio.JobQuerier.
func (t TestJobQuerier) Stream(ctx context.Context, method string, path string, query humio.Query, ch chan humio.StreamingResults) error {
	ch <- humio.StreamingResults{}
	return nil
}

func (t TestJobQuerier) CreateJob(repo string, query humio.Query) (string, error) {
	return t.id, nil
}

func (t TestJobQuerier) DeleteJob(repo string, id string) error {
	return nil
}

func (t TestJobQuerier) PollJob(repo string, id string) (humio.QueryResult, error) {
	return t.queryResult, nil
}

func (t TestJobQuerier) ListRepos() ([]string, error) {
	return t.repos, nil
}

func (t TestJobQuerier) SetAuthHeaders(authHeaders map[string]string) {}
