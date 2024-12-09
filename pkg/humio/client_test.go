package humio_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/stretchr/testify/require"
)

func TestClient(t *testing.T) {
	t.Run("it creates a job and returns an id", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodPost)
			fmt.Fprint(w, `{"id":"testid"}`)
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
			fmt.Fprint(w, "{}")
		})

		err := testClient.DeleteJob("repo", "testid")
		require.Nil(t, err)
	})

	t.Run("it polls a job", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()
		testMux.HandleFunc("/api/v1/repositories/repo/queryjobs/testid", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodGet)
			fmt.Fprint(w, `{
				"cancelled": false,
				"done": false,
				"events": [],
				"metaData": {
				}
			}`)
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
			fmt.Fprint(w, `{
				  "data": {
				    "searchDomains": [
							{ "name": "repo1" },
							{ "name": "repo2" }
						]
				  }
			}`)
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
			reqTokenHeader := req.Header.Get("Authorization")
			require.Equal(t, tokenHeader, reqTokenHeader)
			fmt.Fprint(w, "{}")
		})
		_, err := testClient.ListRepos()
		require.Nil(t, err)
	})

	t.Run("it streams data successfully", func(t *testing.T) {
		setupClientTest()
		defer teardownClientTest()

		testMux.HandleFunc("/api/v1/repositories/repo/query", func(w http.ResponseWriter, req *http.Request) {
			testMethod(t, req, http.MethodPost)

			// Simulate streaming results
			w.Header().Set("Content-Type", "application/json")
			enc := json.NewEncoder(w)
			for i := 0; i < 3; i++ {
				_ = enc.Encode(humio.StreamingResults{
					fmt.Sprintf("Result%d", i+1): fmt.Sprintf("Data %d", i+1),
				})
				time.Sleep(100 * time.Millisecond) // Simulate delay in streaming
			}
		})

		ch := make(chan humio.StreamingResults)
		done := make(chan any)

		go func() {
			err := testClient.Stream(http.MethodPost, "/api/v1/repositories/repo/query", humio.Query{LSQL: "test", Start: "5m"}, ch, done)
			require.Nil(t, err)
		}()

		results := []string{}
		go func() {
			for r := range ch {
				for key, value := range r {
					results = append(results, fmt.Sprintf("%s: %s", key, value))
				}
			}
			close(done) // Signal the end of the stream
		}()

		// Wait for the `done` signal to finish
		<-done

		require.Len(t, results, 3)
		require.Equal(t, "Result1: Data 1", results[0])
		require.Equal(t, "Result2: Data 2", results[1])
		require.Equal(t, "Result3: Data 3", results[2])
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
