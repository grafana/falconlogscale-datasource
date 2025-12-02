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
	"sync"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
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
	Address            *url.URL
	Token              string
	OAuth2             bool
	OAuth2ClientID     string
	OAuth2ClientSecret string
}

type Auth struct {
	OAuthPassThru      bool
	OAuth2             bool
	OAuth2ClientID     string
	OAuth2ClientSecret string
	AccessToken        string
	oauth2Token        string
	oauth2TokenExpiry  time.Time
	oauth2Mutex        sync.RWMutex
	AuthHeaders        map[string]string
}

type OAuth2TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
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
			OAuthPassThru:      httpOpts.ForwardHTTPHeaders,
			OAuth2:             config.OAuth2,
			OAuth2ClientID:     config.OAuth2ClientID,
			OAuth2ClientSecret: config.OAuth2ClientSecret,
			AccessToken:        config.Token,
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

func (c *Client) fetchOAuth2Token() error {
	tokenURL, err := c.URL.Parse("oauth2/token")
	if err != nil {
		return fmt.Errorf("failed to parse oauth2 token URL: %w", err)
	}

	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("client_id", c.OAuth2ClientID)
	data.Set("client_secret", c.OAuth2ClientSecret)

	req, err := http.NewRequest(http.MethodPost, tokenURL.String(), strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create oauth2 token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	// Create a new HTTP client without any custom middleware or authentication
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to fetch oauth2 token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode/100 != 2 {
		var errBody bytes.Buffer
		errBody.ReadFrom(resp.Body)
		backend.Logger.Error("OAuth2 token request failed", "status", resp.Status, "body", errBody.String())
		return fmt.Errorf("oauth2 token request failed with status: %s - %s", resp.Status, errBody.String())
	}

	var tokenResp OAuth2TokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return fmt.Errorf("failed to decode oauth2 token response: %w", err)
	}

	c.oauth2Mutex.Lock()
	c.oauth2Token = tokenResp.AccessToken
	// Set expiry with a 5-minute buffer to refresh before actual expiry
	expiryBuffer := 5 * time.Minute
	expiryDuration := time.Duration(tokenResp.ExpiresIn) * time.Second
	if expiryDuration > expiryBuffer {
		expiryDuration -= expiryBuffer
	}
	c.oauth2TokenExpiry = time.Now().Add(expiryDuration)
	c.oauth2Mutex.Unlock()

	backend.Logger.Debug("OAuth2 token fetched successfully", "expires_in", tokenResp.ExpiresIn)
	return nil
}

func (c *Client) getOAuth2Token() (string, error) {
	c.oauth2Mutex.RLock()
	token := c.oauth2Token
	expiry := c.oauth2TokenExpiry
	c.oauth2Mutex.RUnlock()

	// Check if token is expired or about to expire
	if token == "" || time.Now().After(expiry) {
		// Need to fetch a new token
		if err := c.fetchOAuth2Token(); err != nil {
			return "", err
		}

		c.oauth2Mutex.RLock()
		token = c.oauth2Token
		c.oauth2Mutex.RUnlock()
	}

	return token, nil
}

func (c *Client) addAuthHeaders(req *http.Request) *http.Request {
	if c.OAuth2 {
		// OAuth2 client credentials flow
		token, err := c.getOAuth2Token()
		if err != nil {
			backend.Logger.Error("Failed to get OAuth2 token", "error", err)
			return req
		}
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
	} else {
		authHeader := c.AuthHeaders[backend.OAuthIdentityTokenHeaderName]
		idTokenHeader := c.AuthHeaders[backend.OAuthIdentityIDTokenHeaderName]
		if c.OAuthPassThru && authHeader != "" && idTokenHeader != "" {
			req.Header.Set(backend.OAuthIdentityTokenHeaderName, authHeader)
			req.Header.Set(backend.OAuthIdentityIDTokenHeaderName, idTokenHeader)
		} else {
			req.Header.Set(backend.OAuthIdentityTokenHeaderName, fmt.Sprintf("Bearer %s", c.AccessToken))
		}
	}

	return req
}

func (c *Client) SetAuthHeaders(headers map[string]string) {
	c.AuthHeaders = headers
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
	var errResponse ErrorResponse
	if err := json.NewDecoder(res.Body).Decode(&errResponse); err != nil {
		return fmt.Errorf("%s %s", res.Status, err.Error())
	}
	return fmt.Errorf("%s %s", res.Status, strings.TrimSpace(errResponse.Detail))
}

func (c *Client) Stream(ctx context.Context, method string, path string, query Query, ch chan StreamingResults) error {
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
		if result != nil {
			ch <- result
		}
	}
}
