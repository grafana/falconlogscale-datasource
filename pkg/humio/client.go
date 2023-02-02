package humio

import (
	"net/url"
)

type Client struct {
}

type Config struct {
	Address *url.URL
	Token   string
}

func (c *Client) CreateJob(repo string, query Query) (string, error) {
	return "", nil
}

func (c *Client) DeleteJob(repo string, id string) error {
	return nil
}

func (c *Client) PollJob(repo string, id string) (QueryResult, error) {
	return QueryResult{}, nil
}

func (c *Client) ListViews() ([]string, error) {
	return []string{}, nil
}

func NewClient(config Config) *Client {
	return nil
}
