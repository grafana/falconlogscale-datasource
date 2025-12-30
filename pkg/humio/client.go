package humio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/hasura/go-graphql-client"
	"golang.org/x/sync/singleflight"
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
	OAuth2Config
}

type Auth struct {
	OAuthPassThru bool
	AccessToken   string
	oauth2Token   string
	oauth2Mutex   sync.RWMutex
	oauth2Group   singleflight.Group
	AuthHeaders   map[string]string
	OAuth2Config
}

type OAuth2Config struct {
	OAuth2             bool
	OAuth2ClientID     string
	OAuth2ClientSecret string
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
		return "", backend.PluginError(err)
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
		return f, backend.DownstreamError(err)
	}

	return f, nil
}

func (c *Client) OauthClientSecretHealthCheck() error {
	// Check if we can auth with oauth2 client secret, if we can run a test query
	if c.OAuth2ClientID != "" && c.OAuth2ClientSecret != "" {
		err := c.fetchOAuth2Token()
		if err != nil {
			return err
		}
		repo := "search-all"
		now := time.Now()
		q := Query{
			Start:      strconv.FormatInt(now.Add(-time.Second).UnixMilli(), 10),
			End:        strconv.FormatInt(now.UnixMilli(), 10),
			QueryType:  QueryTypeLQL,
			Repository: repo,
		}
		id, err := c.CreateJob(repo, q)
		// deleting job because we do not care able the results. We just want to make the query
		_ = c.DeleteJob(repo, id)
		if err != nil {
			return err
		}
		return nil
	}
	return fmt.Errorf("clientID and/or clientSecret are empty")
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
		return backend.PluginError(err)
	}
	return client.Query(context.Background(), query, variables)
}

func NewClient(config Config, httpOpts httpclient.Options, streamingOpts httpclient.Options) (*Client, error) {
	client := &Client{
		URL: config.Address,
		Auth: Auth{
			OAuthPassThru: httpOpts.ForwardHTTPHeaders,
			OAuth2Config: OAuth2Config{
				OAuth2:             config.OAuth2,
				OAuth2ClientID:     config.OAuth2ClientID,
				OAuth2ClientSecret: config.OAuth2ClientSecret,
			},
			AccessToken: config.Token,
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

func (c *Client) addOAuth2Headers(req *http.Request) {
	if c.isOAuth2TokenExpired() {
		backend.Logger.Debug("OAuth2 token expired or missing, fetching new token")
		if err := c.fetchOAuth2Token(); err != nil {
			backend.Logger.Error("Failed to fetch OAuth2 token", "error", err)
			return
		}
	}

	c.oauth2Mutex.RLock()
	token := c.oauth2Token
	c.oauth2Mutex.RUnlock()

	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
}

func (c *Client) addPassThruHeaders(req *http.Request) {
	authHeader := c.AuthHeaders[backend.OAuthIdentityTokenHeaderName]
	idTokenHeader := c.AuthHeaders[backend.OAuthIdentityIDTokenHeaderName]

	if authHeader != "" && idTokenHeader != "" {
		req.Header.Set(backend.OAuthIdentityTokenHeaderName, authHeader)
		req.Header.Set(backend.OAuthIdentityIDTokenHeaderName, idTokenHeader)
	} else {
		c.addStaticTokenHeaders(req)
	}
}

func (c *Client) addStaticTokenHeaders(req *http.Request) {
	req.Header.Set(backend.OAuthIdentityTokenHeaderName, fmt.Sprintf("Bearer %s", c.AccessToken))
}

func (c *Client) addAuthHeaders(req *http.Request) *http.Request {
	switch {
	case c.OAuth2:
		c.addOAuth2Headers(req)
	case c.OAuthPassThru:
		c.addPassThruHeaders(req)
	default:
		c.addStaticTokenHeaders(req)
	}

	return req
}

func (c *Client) SetAuthHeaders(headers map[string]string) error {
	if c.OAuthPassThru {
		authHeader := headers[backend.OAuthIdentityTokenHeaderName]
		idTokenHeader := headers[backend.OAuthIdentityIDTokenHeaderName]
		if authHeader != "" && idTokenHeader != "" {
			if IsExpired(authHeader) || IsExpired(idTokenHeader) {
				return fmt.Errorf("OAuth tokens are expired, please refresh")
			}
		}
	}

	c.AuthHeaders = headers

	return nil
}

func (c *Client) Fetch(method string, path string, body *bytes.Buffer, out interface{}) error {
	return c.fetchWithRetry(method, path, body, out, false)
}

func (c *Client) fetchWithRetry(method string, path string, body *bytes.Buffer, out interface{}, isRetry bool) error {
	url, err := url.JoinPath(c.URL.String(), path)
	if err != nil {
		return err
	}

	var req *http.Request
	var bodyBytes []byte
	if body != nil {
		bodyBytes = body.Bytes()
	}

	if bodyBytes != nil {
		req, err = http.NewRequest(method, url, bytes.NewReader(bodyBytes))
	} else {
		req, err = http.NewRequest(method, url, bytes.NewReader(nil))
	}
	if err != nil {
		return err
	}
	req = c.addAuthHeaders(req)
	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		err := res.Body.Close()
		if err != nil {
			backend.Logger.Warn("failed to close response body: %s", err.Error())
		}
	}()
	if res.StatusCode == http.StatusOK {
		return json.NewDecoder(res.Body).Decode(&out)
	}
	if res.StatusCode == http.StatusNoContent {
		return fmt.Errorf("%s %s", res.Status, "No content returned from request")
	}

	if c.handleOAuth2AuthError(isRetry, res.StatusCode) {
		// Retry the request with the new token
		return c.fetchWithRetry(method, path, bytes.NewBuffer(bodyBytes), out, true)
	}

	var errResponse ErrorResponse
	if err := json.NewDecoder(res.Body).Decode(&errResponse); err != nil {
		log.DefaultLogger.Warn("failed to decode body as json", "error", err)
		stringErr, err := io.ReadAll(res.Body)
		if err != nil {
			return fmt.Errorf("%s %s", res.Status, "failed to read response body")
		}
		return fmt.Errorf("%s %s", res.Status, string(stringErr))
	}
	return fmt.Errorf("%s %s", res.Status, strings.TrimSpace(errResponse.Detail))
}

func (c *Client) Stream(ctx context.Context, method string, path string, query Query, ch chan StreamingResults) error {
	return c.streamWithRetry(ctx, method, path, query, ch, false)
}

func (c *Client) streamWithRetry(ctx context.Context, method string, path string, query Query, ch chan StreamingResults, isRetry bool) error {
	var humioQuery struct {
		QueryString string `json:"queryString"`
		Live        bool   `json:"isLive"`
	}
	humioQuery.QueryString = query.LSQL
	humioQuery.Live = true

	var buf bytes.Buffer
	err := json.NewEncoder(&buf).Encode(humioQuery)
	if err != nil {
		return err
	}
	url, err := url.JoinPath(c.URL.String(), path)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, method, url, &buf)
	if err != nil {
		return err
	}
	req = c.addAuthHeaders(req)

	res, err := c.StreamingClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		if err := res.Body.Close(); err != nil {
			log.DefaultLogger.Warn("Failed to close response body", "error", err)
		}
	}()

	if c.handleOAuth2AuthError(isRetry, res.StatusCode) {
		return c.streamWithRetry(ctx, method, path, query, ch, true)
	}

	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("stream request failed with status: %s", res.Status)
	}

	d := json.NewDecoder(res.Body)

	for {
		select {
		case <-ctx.Done():
			if ctx.Err() == context.Canceled {
				return nil
			}
			return ctx.Err()
		default:
		}
		var result StreamingResults
		if err := d.Decode(&result); err != nil {
			return fmt.Errorf("error decoding stream result: %w", err)
		}
		if result != nil && ch != nil {
			ch <- result
		}
	}
}
