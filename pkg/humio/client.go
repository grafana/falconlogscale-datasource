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
	"github.com/shurcooL/graphql"
)

type Client struct {
	URL        *url.URL
	HTTPClient *http.Client
}

type Config struct {
	Address            *url.URL
	Token              string
	InsecureSkipVerify bool
	TlsClientAuth      bool
	TlsAuthWithCACert  bool
	TlsCACert          string
	TlsClientCert      string
	TlsClientKey       string
	TlsServerName      string
}

func (c *Client) CreateJob(repo string, query Query) (string, error) {
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

func (c *Client) newGraphQLClient() (*graphql.Client, error) {
	graphqlURL, _ := c.URL.Parse("graphql")
	return graphql.NewClient(graphqlURL.String(), c.HTTPClient), nil
}

func (c *Client) GraphQLQuery(query interface{}, variables map[string]interface{}) error {
	client, err := c.newGraphQLClient()
	if err != nil {
		return err
	}
	return client.Query(context.Background(), query, variables)
}

func NewClient(config Config, httpOpts httpclient.Options) (*Client, error) {
	client := &Client{
		URL: config.Address,
	}

	httpOpts.Headers["Content-Type"] = "application/json"
	if !httpOpts.ForwardHTTPHeaders {
		httpOpts.Headers["Authorization"] = fmt.Sprintf("Bearer %s", config.Token)
	}

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
