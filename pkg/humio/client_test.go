package humio_test

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/stretchr/testify/require"
)

func TestClient(t *testing.T) {
	t.Run("it creates a job and returns an id", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodPost)
			fmt.Fprint(w, `{"id":"testid"}`) //nolint:errcheck
		})

		id, err := testClient.CreateJob("repo", humio.Query{})
		require.Nil(t, err)
		require.Equal(t, "testid", id)
	})

	t.Run("it deletes a job", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs/testid", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodDelete)
			fmt.Fprint(w, "{}") //nolint:errcheck
		})

		err := testClient.DeleteJob("repo", "testid")
		require.Nil(t, err)
	})

	t.Run("it polls a job", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs/testid", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodGet)
			cancelledRes := `{
				"cancelled": false,
				"done": false,
				"events": [],
				"metaData": {
				}
			}`
			fmt.Fprint(w, cancelledRes) //nolint:errcheck
		})

		r, err := testClient.PollJob("repo", "testid")
		require.Nil(t, err)
		require.Equal(t, false, r.Done)
		require.Equal(t, false, r.Cancelled)
		require.Len(t, r.Events, 0)
	})

	t.Run("it lists all repos", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/graphql", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodPost)
			listRes := `{
				  "data": {
				    "searchDomains": [
							{ "name": "repo1" },
							{ "name": "repo2" }
						]
				  }
			}`
			fmt.Fprint(w, listRes) //nolint:errcheck
		})

		r, err := testClient.ListRepos()
		require.Nil(t, err)
		require.Len(t, r, 2)
	})

	t.Run("it adds the token as the auth header if ForwardHTTPHeaders is false", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/graphql", func(w http.ResponseWriter, req *http.Request) {
			tokenHeader := "Bearer testToken"
			reqTokenHeader := req.Header.Get(backend.OAuthIdentityTokenHeaderName)
			require.Equal(t, tokenHeader, reqTokenHeader)
			fmt.Fprint(w, "{}") //nolint:errcheck
		})
		_, err := testClient.ListRepos()
		require.Nil(t, err)
	})

	t.Run("it streams results", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs/stream", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodPost)
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"events": [{"message": "test event"}]}`) //nolint:errcheck
		})

		ch := make(chan humio.StreamingResults)
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()

		go func() {
			err := testClient.Stream(ctx, http.MethodPost, "api/v1/repositories/repo/queryjobs/stream", humio.Query{LSQL: "test query"}, ch)
			require.ErrorIs(t, err, io.EOF)
		}()

		select {
		case result := <-ch:
			require.Len(t, result, 1)
			expected := []any{map[string]any{"message": "test event"}}
			require.EqualValues(t, expected, result["events"])
		case <-ctx.Done():
			t.Fatal("context cancelled before receiving result")
		}
	})
}

var (
	testMux    *http.ServeMux
	testClient *humio.Client
	testServer *httptest.Server
)

func setupClientTest() {
	testMux = http.NewServeMux()
	testServer = httptest.NewServer(testMux)

	url, _ := url.Parse(testServer.URL)
	token := "testToken"
	config := humio.Config{Address: url, Token: token}
	httpOpts := httpclient.Options{Header: http.Header{}}

	var err error
	testClient, err = humio.NewClient(config, httpOpts, httpOpts)
	if err != nil {
		panic(err)
	}
}

func teardownClientTest() {
	testServer.Close()
}

func testMethod(t *testing.T, r *http.Request, want string) {
	require.Equal(t, want, r.Method)
}
