package humio

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/shurcooL/graphql"
)

type Client struct {
	BaseURL    string
	UserAgent  string
	Token      string
	HTTPClient HTTPClient
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

type ViewListItem struct {
	Name string
}

func (c *Client) ListViews() ([]string, error) {
	var query struct {
		View []ViewListItem `graphql:"searchDomains"`
	}

	err := c.Query(&query, nil)

	sort.Slice(query.View, func(i, j int) bool {
		return strings.ToLower(query.View[i].Name) < strings.ToLower(query.View[j].Name)
	})

	var f []string
	for _, v := range query.View {
		f = append(f, v.Name)
	}
	return f, err
}

func (c *Client) newGraphQLClient() (*graphql.Client, error) {
	//httpClient := c.newHTTPClientWithHeaders(c.headers())
	//graphqlURL, err := c.Address().Parse("graphql")
	f, _ := url.Parse(c.BaseURL)
	/*

		httpClient := c.newHTTPClientWithHeaders(c.headers())
		graphqlURL, err := c.Address().Parse("graphql")
		if err != nil {
			return nil, err
		}
		return graphql.NewClient(graphqlURL.String(), httpClient), nil
	*/
	graphqlURL, _ := f.Parse("graphql") //change to append url
	return graphql.NewClient(graphqlURL.String(), &http.Client{
		Transport: &http.Transport{
			Proxy: func(r *http.Request) (*url.URL, error) {
				r.Header.Add("Authorization", fmt.Sprintf("Bearer %s", c.Token))
				r.Header.Add("Content-Type", "application/json")
				return nil, nil
			},
		},
	}), nil
}

func (c *Client) Query(query interface{}, variables map[string]interface{}) error {
	client, err := c.newGraphQLClient()
	if err != nil {
		return err
	}
	return client.Query(context.Background(), query, variables)
}

func NewClient(config Config) *Client /*err*/ {
	client := &Client{
		BaseURL: config.Address.String(),
		Token:   config.Token,
	}
	hc, err := httpclient.New(httpclient.Options{})
	if err != nil {
		return nil //, err
	}
	client.HTTPClient = NewHTTPClient(hc, config.Token)
	return client
}

type ErrorResponse struct {
	Detail string `json:"detail"`
}

func (c *Client) Fetch(method string, path string, body *bytes.Buffer, out interface{}) error {
	url, err := url.JoinPath(c.BaseURL, path)
	if err != nil {
		return err
	}
	var req *http.Request
	if body == nil {
		req, _ = http.NewRequest(method, url, bytes.NewReader(nil))

	} else {
		req, _ = http.NewRequest(method, url, body)
	}
	res, err := c.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusOK {
		if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
			return err
		}
	} else if res.StatusCode == http.StatusNoContent {
		return err
	} else {
		var errResponse ErrorResponse
		if err := json.NewDecoder(res.Body).Decode(&errResponse); err != nil {
			errorMessage := strings.TrimSpace(fmt.Sprintf("%s %s", res.Status, err.Error()))
			return errors.New(errorMessage)
		}
		errorMessage := strings.TrimSpace(fmt.Sprintf("%s %s", res.Status, errResponse.Detail))
		return errors.New(errorMessage)
	}
	return err
}
