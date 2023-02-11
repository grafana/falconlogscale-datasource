package plugin_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/experimental"
	humio "github.com/humio/cli/api"
	"github.com/stretchr/testify/assert"
)

func checkFramesGoldenData(t *testing.T, frames data.Frames, name string) {
	assert.NotNil(t, frames)
	dr := &backend.DataResponse{Frames: frames}
	experimental.CheckGoldenJSONResponse(t, "../test_data/", name, dr, false)
}

var (
	// testMux is the HTTP request multiplexer used with the test server.
	testMux *http.ServeMux
	// testClient is the gitlab client being tested.
	testClient *humio.Client
	// testServer is a test HTTP server used to provide mock API responses.
	testServer *httptest.Server
)

func setup2() {
	testMux = http.NewServeMux()
	testServer = httptest.NewServer(testMux)

	config := humio.Config{
		Address: testServer.Certificate().URIs[0],
	}
	testClient = humio.NewClient(config)
}

func teardown() {
	testServer.Close()
}

func getContext() context.Context {
	type key string
	k := key("foo")
	return context.WithValue(context.TODO(), k, "foo")
}

func testMethod(t *testing.T, r *http.Request, want string) {
	if got := r.Method; got != want {
		t.Errorf("Request method: %v, want %v", got, want)
	}
}

func testRequestURL(t *testing.T, r *http.Request, want string) {
	if got := r.URL.String(); !strings.HasPrefix(got, want) {
		t.Errorf("Request URL: %v, want %v", got, want)
	}
}

func mockResponse(t *testing.T, mockResults string, endPoint string) {
	resultsRaw, err := os.ReadFile(mockResults)
	if err != nil {
		t.Error(err.Error())
	}

	testMux.HandleFunc(endPoint, func(w http.ResponseWriter, r *http.Request) {
		testMethod(t, r, "GET")
		testRequestURL(t, r, endPoint)
		fmt.Fprint(w, string(resultsRaw))
	})
}
