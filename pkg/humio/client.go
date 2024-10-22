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
		return "", err
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
	return f, err
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
		return err
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

	var req *http.Request
	req, err = http.NewRequest(method, url, &buf)
	if err != nil {
		return err
	}
	req = c.addAuthHeaders(req)

	// Set up a context with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel() // Ensure cancellation to prevent resource leaks

	req = req.WithContext(ctx)

	res, err := c.StreamingClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		res.Body.Close()
	}()

	d := json.NewDecoder(res.Body)

	// Set up ticker to prevent infinite loop
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done(): // If the context is canceled or times out, break the loop
			return ctx.Err()

		case <-ticker.C: // Ticker will check periodically
			var result StreamingResults
			err := d.Decode(&result)
			if err != nil {
				return err
			}
			if result != nil {
				ch <- result
			}
		}
	}
}
