package humio

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/shurcooL/graphql"
)

type Client struct {
	URL        *url.URL
	HTTPClient *http.Client
}

type Config struct {
	Address *url.URL
	Token   string
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

func NewClient(config Config) *Client {
	client := &Client{
		URL: config.Address,
	}
	client.HTTPClient = newHTTPClientWithHeaders(config.Token)
	return client
}

// set up an https server and connect with tls settings. if it returns a 404 tls settings worked
func newHTTPClientWithHeaders(setting Settings) *http.Client {
	headers := map[string]string{
		"Authorization": fmt.Sprintf("Bearer %s", setting.AccessToken),
		"Content-Type":  "application/json",
	}

	tlsConfig, err := ds.GetTLSConfig()
	if err != nil {
		return nil, err
	}

	tlsConfig.Renegotiation = tls.RenegotiateFreelyAsClient

	rt := &http.Transport{
		TLSClientConfig: tlsConfig,
		Proxy:           http.ProxyFromEnvironment,
		Dial: (&net.Dialer{
			Timeout:   time.Duration(setting.DataProxyTimeout) * time.Second,
			KeepAlive: time.Duration(setting.DataProxyKeepAlive) * time.Second,
		}).Dial,
		TLSHandshakeTimeout:   time.Duration(setting.DataProxyTLSHandshakeTimeout) * time.Second,
		ExpectContinueTimeout: time.Duration(setting.DataProxyExpectContinueTimeout) * time.Second,
		MaxIdleConns:          setting.DataProxyMaxIdleConns,
		IdleConnTimeout:       time.Duration(setting.DataProxyIdleConnTimeout) * time.Second,
	}

	return &http.Client{
		Transport: &HttpHeaderTransport{
			rt:      rt,
			headers: headers,
		},
	}
}

// tlsConfig.Renegotiation = tls.RenegotiateFreelyAsClient

// // Create transport which adds all
// customHeaders := ds.getCustomHeaders()
// transport := &http.Transport{
// 	TLSClientConfig: tlsConfig,
// 	Proxy:           http.ProxyFromEnvironment,
// 	Dial: (&net.Dialer{
// 		Timeout:   time.Duration(setting.DataProxyTimeout) * time.Second,
// 		KeepAlive: time.Duration(setting.DataProxyKeepAlive) * time.Second,
// 	}).Dial,
// 	TLSHandshakeTimeout:   time.Duration(setting.DataProxyTLSHandshakeTimeout) * time.Second,
// 	ExpectContinueTimeout: time.Duration(setting.DataProxyExpectContinueTimeout) * time.Second,
// 	MaxIdleConns:          setting.DataProxyMaxIdleConns,
// 	IdleConnTimeout:       time.Duration(setting.DataProxyIdleConnTimeout) * time.Second,
// }

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
