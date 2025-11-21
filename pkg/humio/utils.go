package humio

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type RepoVariableResponse struct {
	Name  string
	Value string
}

func ConvertRepos(repos []string) []RepoVariableResponse {
	reposMapped := []RepoVariableResponse{}
	if len(repos) > 0 {
		for _, r := range repos {
			reposMapped = append(reposMapped, RepoVariableResponse{
				Name:  r,
				Value: r,
			})
		}
	}

	return reposMapped
}

// Returns true if the token can be parsed and is expired, false otherwise
func IsExpired(token string) bool {
	if token != "" {
		claims := jwt.MapClaims{}
		_, _, err := jwt.NewParser(jwt.WithValidMethods([]string{"ES256"})).ParseUnverified(token, claims)
		if err != nil {
			return false
		}

		expiry, err := claims.GetExpirationTime()
		if err != nil || expiry == nil {
			return false
		}

		currTime := time.Now()

		return expiry.Before(currTime)
	}

	return false
}
