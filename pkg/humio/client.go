package humio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/errorsource"
	"github.com/hasura/go-graphql-client"
)

type Client struct {
	URL             *url.URL
	HTTPClient      *http.Client
	StreamingClient *http.Client
	Auth
}

type Config struct {
	Address *url.URL
	Token   string
}

type Auth struct {
	OAuthPassThru bool
	AccessToken   string
	AuthHeaders   map[string]string
}

func (c *Client) CreateJob(repo string, query Query) (string, error) {
	var jsonResponse struct {
		ID string `json:"id"`
	}
	var humioQuery struct {
		QueryString string `json:"queryString"`
		Start       string `json:"start,omitempty"`
		End         string `json:"end,omitempty"`
		Live        bool   `json:"isLive"`
	}
	humioQuery.QueryString = query.LSQL
	humioQuery.Start = query.Start
	humioQuery.End = query.End
	humioQuery.Live = false
	var buf bytes.Buffer
	err := json.NewEncoder(&buf).Encode(humioQuery)
	if err != nil {
		// This is technically a plugin error so we set it here
		// to avoid it being overwritten by a higher level errorsource call
		return "", errorsource.PluginError(err, false)
	}

	err = c.Fetch(http.MethodPost, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs", &buf, &jsonResponse)
	if err != nil {
		return "", err
	}

	return jsonResponse.ID, nil
}

func (c *Client) DeleteJob(repo string, id string) error {
	return c.Fetch(http.MethodDelete, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs/"+id, nil, nil)
}

func (c *Client) PollJob(repo string, id string) (QueryResult, error) {
	var jsonResponse QueryResult

	err := c.Fetch(http.MethodGet, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs/"+id, nil, &jsonResponse)
	if err != nil {
		return QueryResult{}, err
	}

	return jsonResponse, nil
}

type RepoListItem struct {
	Name string
}

func (c *Client) ListRepos() ([]string, error) {
	var query struct {
		Views []RepoListItem `graphql:"searchDomains"`
	}

	err := c.GraphQLQuery(&query, nil)

	sort.Slice(query.Views, func(i, j int) bool {
		return strings.ToLower(query.Views[i].Name) < strings.ToLower(query.Views[j].Name)
	})

	var f []string
	for _, v := range query.Views {
		f = append(f, v.Name)
	}

	if err != nil {
		return f, errorsource.DownstreamError(err, false)
	}

	return f, nil
}

func (c *Client) setAuthHeaders() graphql.RequestModifier {
	return func(req *http.Request) {
		c.addAuthHeaders(req)
	}
}

func (c *Client) newGraphQLClient() (*graphql.Client, error) {
	graphqlURL, _ := c.URL.Parse("graphql")

	return graphql.NewClient(graphqlURL.String(), c.HTTPClient).WithRequestModifier(c.setAuthHeaders()), nil
}

func (c *Client) GraphQLQuery(query interface{}, variables map[string]interface{}) error {
	client, err := c.newGraphQLClient()
	if err != nil {
		return errorsource.PluginError(err, false)
	}
	return client.Query(context.Background(), query, variables)
}

func NewClient(config Config, httpOpts httpclient.Options, streamingOpts httpclient.Options) (*Client, error) {
	client := &Client{
		URL: config.Address,
		Auth: Auth{
			OAuthPassThru: httpOpts.ForwardHTTPHeaders,
			AccessToken:   config.Token,
		},
	}

	httpOpts.Header.Add("Content-Type", "application/json")
	c, err := httpclient.NewProvider().New(httpOpts)
	if err != nil {
		return nil, err
	}
	client.HTTPClient = c

	client.StreamingClient, err = newStreamingClient(streamingOpts)
	if err != nil {
		return nil, err
	}

	return client, nil
}

func newStreamingClient(opts httpclient.Options) (*http.Client, error) {
	c, err := httpclient.NewProvider().New(opts)
	if err != nil {
		return nil, err
	}
	return c, nil
}

type ErrorResponse struct {
	Detail string `json:"detail"`
}

func (c *Client) addAuthHeaders(req *http.Request) *http.Request {
	authHeader := c.Auth.AuthHeaders["Authorization"]
	idTokenHeader := c.Auth.AuthHeaders["X-Id-Token"]
	if c.OAuthPassThru && authHeader != "" && idTokenHeader != "" {
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("X-Id-Token", idTokenHeader)
	} else {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.AccessToken))
	}

	return req
}

func (c *Client) SetAuthHeaders(headers map[string]string) {
	c.Auth.AuthHeaders = headers
}

func (c *Client) Fetch(method string, path string, body *bytes.Buffer, out interface{}) error {
	url, err := url.JoinPath(c.URL.String(), path)
	if err != nil {
		return err
	}

	var req *http.Request
	if body == nil {
		req, err = http.NewRequest(method, url, bytes.NewReader(nil))
	} else {
		req, err = http.NewRequest(method, url, body)
	}
	if err != nil {
		return err
	}
	req = c.addAuthHeaders(req)
	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		return json.NewDecoder(res.Body).Decode(&out)
	}
	if res.StatusCode == http.StatusNoContent {
		return fmt.Errorf("%s %s", res.Status, "No content returned from request")
	}
	var errResponse ErrorResponse
	if err := json.NewDecoder(res.Body).Decode(&errResponse); err != nil {
		return fmt.Errorf("%s %s", res.Status, err.Error())
	}
	return fmt.Errorf("%s %s", res.Status, strings.TrimSpace(errResponse.Detail))
}

func (c *Client) Stream(method string, path string, query Query, ch chan StreamingResults, done chan any) error {
	var humioQuery struct {
		QueryString string `json:"queryString"`
		Start       string `json:"start,omitempty"`
		Live        bool   `json:"isLive"`
	}
	humioQuery.QueryString = query.LSQL
	humioQuery.Start = query.Start
	humioQuery.Live = true

	defer close(done)

	var buf bytes.Buffer
	err := json.NewEncoder(&buf).Encode(humioQuery)
	if err != nil {
		return err
	}
	url, err := url.JoinPath(c.URL.String(), path)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(method, url, &buf)
	if err != nil {
		return err
	}
	req = c.addAuthHeaders(req)

	// Create a context with a timeout to avoid endless streaming
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Second)
	defer cancel()

	req = req.WithContext(ctx)

	res, err := c.StreamingClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			log.DefaultLogger.Warn("Failed to close response body", "error", err)
		}
	}()

	d := json.NewDecoder(res.Body)

	// Create a channel for decoder errors
	decodeErrChan := make(chan error, 1)

	// Start decoding in a separate goroutine
	go func() {
		for {
			var result StreamingResults
			if err := d.Decode(&result); err != nil {
				if err.Error() != "EOF" {
					log.DefaultLogger.Error("Error decoding stream result:", "err", err)
					decodeErrChan <- err // Send error to channel
				}
				close(decodeErrChan) // Signal decoding is complete
				return
			}
			if result != nil {
				ch <- result
			}
		}
	}()

	for {
		select {
		case <-ctx.Done():
			log.DefaultLogger.Info("Context done, ending stream", "reason", ctx.Err())
			return ctx.Err()

		case err := <-decodeErrChan:
			if err != nil {
				log.DefaultLogger.Info("Decoder encountered an error, exiting stream")
				return err
			}
			log.DefaultLogger.Info("Decoder completed without error, exiting stream")
			return nil

		case <-done:
			log.DefaultLogger.Info("Stream done, exiting")
			return nil
		}
	}
}
