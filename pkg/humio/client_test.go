package humio_test

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

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
				}`,
			)
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
				}`,
			)
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
			reqTokenHeader := req.Header["Authorization"][0]
			if reqTokenHeader != tokenHeader {
				t.Errorf("Token header: got %s, want %s", reqTokenHeader, tokenHeader)
			}
			fmt.Fprint(w, "{}")
		})
		_, err := testClient.ListRepos()
		require.Nil(t, err)
	})

	//remove this test. its not a good functional test
	// t.Run("d", func(t *testing.T) {
	// 	url, _ := url.Parse("https://cloud.community.humio.com/")
	// 	config := humio.Config{Address: url, Token: "fill this in"}
	// 	httpOpts := httpclient.Options{Headers: map[string]string{}}
	// 	c, _ := humio.NewClient(config, httpOpts)
	// 	var humioQuery humio.Query
	// 	humioQuery.LSQL = ""
	// 	humioQuery.Start = "1m"
	// 	ch := make(chan humio.StreamingResults)
	// 	go c.GetStream(http.MethodPost, "api/v1/repositories/humio-organization-github-demo/query", humioQuery, &ch)
	// 	for r := range ch {
	// 		println(r)
	// 	}
	// 	require.Nil(t, nil)
	// })
}

var (
	// testMux is the HTTP request multiplexer used with the test server.
	testMux *http.ServeMux
	// testClient is the Humio client being tested.
	testClient *humio.Client
	// testServer is a test HTTP server used to provide mock API responses.
	testServer *httptest.Server
)

func setupClientTest() {
	// Test server
	testMux = http.NewServeMux()
	testServer = httptest.NewServer(testMux)

	url, _ := url.Parse(testServer.URL)
	token := "testToken"
	config := humio.Config{Address: url, Token: token}
	httpOpts := httpclient.Options{Headers: map[string]string{}}
	var err error
	testClient, err = humio.NewClient(config, httpOpts)
	if err != nil {
		panic(err)
	}
}

func teardownClientTest() {
	testServer.Close()
}

func testMethod(t *testing.T, r *http.Request, want string) {
	if got := r.Method; got != want {
		t.Errorf("Request method: %v, want %v", got, want)
	}
}
