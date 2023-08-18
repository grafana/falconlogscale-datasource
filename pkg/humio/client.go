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

	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/hasura/go-graphql-client"
)

type Client struct {
	URL           *url.URL
	HTTPClient    *http.Client
	OAuthPassThru bool
	AccessToken   string
}

type Config struct {
	Address *url.URL
	Token   string
}

type AuthHeaders map[string]string

func (c *Client) CreateJob(repo string, query Query, authHeaders AuthHeaders) (string, error) {
	var jsonResponse struct {
		ID string `json:"id"`
	}
	var humioQuery struct {
		QueryString string `json:"queryString"`
		Start       string `json:"start"`
		End         string `json:"end"`
	}
	humioQuery.QueryString = query.LSQL
	humioQuery.Start = query.Start
	humioQuery.End = query.End
	var buf bytes.Buffer
	err := json.NewEncoder(&buf).Encode(humioQuery)
	if err != nil {
		return "", err
	}

	err = c.Fetch(http.MethodPost, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs", &buf, &jsonResponse, authHeaders)
	if err != nil {
		return "", err
	}

	return jsonResponse.ID, nil
}

func (c *Client) DeleteJob(repo string, id string, authHeaders AuthHeaders) error {
	return c.Fetch(http.MethodDelete, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs/"+id, nil, nil, authHeaders)
}

func (c *Client) PollJob(repo string, id string, authHeaders AuthHeaders) (QueryResult, error) {
	var jsonResponse QueryResult

	err := c.Fetch(http.MethodGet, "api/v1/repositories/"+url.QueryEscape(repo)+"/queryjobs/"+id, nil, &jsonResponse, authHeaders)
	if err != nil {
		return QueryResult{}, err
	}

	return jsonResponse, nil
}

type RepoListItem struct {
	Name string
}

func (c *Client) ListRepos(authHeaders AuthHeaders) ([]string, error) {
	var query struct {
		Views []RepoListItem `graphql:"searchDomains"`
	}

	err := c.GraphQLQuery(&query, nil, authHeaders)

	sort.Slice(query.Views, func(i, j int) bool {
		return strings.ToLower(query.Views[i].Name) < strings.ToLower(query.Views[j].Name)
	})

	var f []string
	for _, v := range query.Views {
		f = append(f, v.Name)
	}
	return f, err
}

func (c *Client) setAuthHeaders(authHeaders AuthHeaders) graphql.RequestModifier {
	return func(req *http.Request) {
		c.addAuthHeaders(req, authHeaders)
	}
}

func (c *Client) newGraphQLClient(authHeaders AuthHeaders) (*graphql.Client, error) {
	graphqlURL, _ := c.URL.Parse("graphql")

	return graphql.NewClient(graphqlURL.String(), c.HTTPClient).WithRequestModifier(c.setAuthHeaders(authHeaders)), nil
}

func (c *Client) GraphQLQuery(query interface{}, variables map[string]interface{}, authHeaders AuthHeaders) error {
	client, err := c.newGraphQLClient(authHeaders)
	if err != nil {
		return err
	}
	return client.Query(context.Background(), query, variables)
}

func NewClient(config Config, httpOpts httpclient.Options) (*Client, error) {
	client := &Client{
		URL:           config.Address,
		OAuthPassThru: httpOpts.ForwardHTTPHeaders,
		AccessToken:   config.Token,
	}

	httpOpts.Headers["Content-Type"] = "application/json"

	c, err := httpclient.NewProvider().New(httpOpts)
	if err != nil {
		return nil, err
	}
	client.HTTPClient = c

	return client, nil
}

type ErrorResponse struct {
	Detail string `json:"detail"`
}

func (c *Client) addAuthHeaders(req *http.Request, authHeaders AuthHeaders) *http.Request {
	authHeader := authHeaders["Authorization"]
	idTokenHeader := authHeaders["X-Id-Token"]
	if c.OAuthPassThru && authHeader != "" && idTokenHeader != "" {
		req.Header.Set("Authorization", authHeader)
		req.Header.Set("X-Id-Token", idTokenHeader)
	} else {
		req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", c.AccessToken))
	}

	return req
}

func (c *Client) Fetch(method string, path string, body *bytes.Buffer, out interface{}, authHeaders AuthHeaders) error {
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
	req = c.addAuthHeaders(req, authHeaders)
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
