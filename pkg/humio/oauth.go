package humio

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

type OAuth2TokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
}

func (c *Client) fetchOAuth2Token() error {
	_, err, _ := c.oauth2Group.Do("oauth2-token", func() (any, error) {
		tokenURL, err := c.URL.Parse("oauth2/token")
		if err != nil {
			return nil, fmt.Errorf("failed to parse oauth2 token URL: %w", err)
		}

		data := url.Values{}
		data.Set("grant_type", "client_credentials")
		data.Set("client_id", c.OAuth2ClientID)
		data.Set("client_secret", c.OAuth2ClientSecret)

		req, err := http.NewRequest(http.MethodPost, tokenURL.String(), strings.NewReader(data.Encode()))
		if err != nil {
			return nil, fmt.Errorf("failed to create oauth2 token request: %w", err)
		}
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		// Create a new HTTP client without any custom middleware or authentication
		client := &http.Client{
			Timeout: 30 * time.Second,
		}

		resp, err := client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("failed to fetch oauth2 token: %w", err)
		}
		defer func() {
			if err := resp.Body.Close(); err != nil {
				log.DefaultLogger.Warn("Failed to close response body", "error", err)
			}
		}()

		if resp.StatusCode/100 != 2 {
			var errBody bytes.Buffer
			_, err = errBody.ReadFrom(resp.Body)
			if err != nil {
				return nil, err
			}
			log.DefaultLogger.Error("OAuth2 token request failed", "status", resp.Status, "body", errBody.String())
			return nil, fmt.Errorf("oauth2 token request failed with status: %s", resp.Status)
		}

		var tokenResp OAuth2TokenResponse
		if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
			return nil, fmt.Errorf("failed to decode oauth2 token response: %w", err)
		}

		c.oauth2Mutex.Lock()
		c.oauth2Token = tokenResp.AccessToken
		c.oauth2Mutex.Unlock()

		return nil, nil
	})

	return err
}

// handleOAuth2AuthError checks if a request should be retried due to OAuth2 authentication errors.
// It returns true if the request should be retried with a refreshed token.
func (c *Client) handleOAuth2AuthError(isRetry bool, statusCode int) bool {
	if !isRetry || !c.OAuth2 || (statusCode != http.StatusUnauthorized && statusCode != http.StatusForbidden) {
		return false
	}

	backend.Logger.Debug("Received auth error, attempting to refresh OAuth2 token", "status", statusCode)

	c.oauth2Mutex.Lock()
	c.oauth2Token = ""
	c.oauth2Mutex.Unlock()

	if err := c.fetchOAuth2Token(); err != nil {
		backend.Logger.Error("Failed to refresh OAuth2 token", "error", err)
		return false
	}

	backend.Logger.Debug("OAuth2 token refreshed successfully, retrying request")
	return true
}

// isOAuth2TokenExpired checks if the OAuth2 token is missing or expired.
func (c *Client) isOAuth2TokenExpired() bool {
	c.oauth2Mutex.RLock()
	defer c.oauth2Mutex.RUnlock()
	return c.oauth2Token == "" || IsExpired(c.oauth2Token)
}
