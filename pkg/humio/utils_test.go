package humio_test

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/stretchr/testify/require"
)

func TestIsExpired(t *testing.T) {
	secretKey := []byte("secret-key")

	t.Run("returns false for empty token", func(t *testing.T) {
		result := humio.IsExpired("")
		require.False(t, result)
	})

	t.Run("returns false for invalid token", func(t *testing.T) {
		result := humio.IsExpired("invalid-token")
		require.False(t, result)
	})

	t.Run("returns false for token without expiry claim", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "1234567890",
			"iat": time.Now().Unix(),
		})

		tokenString, err := token.SignedString(secretKey)
		require.NoError(t, err)

		result := humio.IsExpired(tokenString)
		require.False(t, result)
	})

	t.Run("returns true for expired token", func(t *testing.T) {
		now := time.Now()
		expiredTime := now.Add(-1 * time.Hour)
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "1234567890",
			"exp": expiredTime.Unix(),
			"iat": now.Add(-48 * time.Hour).Unix(),
		})

		tokenString, err := token.SignedString(secretKey)
		require.NoError(t, err)

		result := humio.IsExpired(tokenString)
		require.True(t, result)
	})

	t.Run("returns false for non-expired token", func(t *testing.T) {
		futureTime := time.Now().Add(1 * time.Hour)
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "1234567890",
			"exp": futureTime.Unix(),
			"iat": time.Now().Unix(),
		})

		tokenString, err := token.SignedString(secretKey)
		require.NoError(t, err)

		result := humio.IsExpired(tokenString)
		require.False(t, result)
	})

	t.Run("handles token with Bearer prefix", func(t *testing.T) {
		expiredTime := time.Now().Add(-1 * time.Hour)

		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "1234567890",
			"exp": expiredTime.Unix(),
			"iat": time.Now().Add(-2 * time.Hour).Unix(),
		})

		tokenString, err := token.SignedString(secretKey)
		require.NoError(t, err)

		bearerToken := "Bearer " + tokenString

		result := humio.IsExpired(bearerToken)
		require.True(t, result)
	})

	t.Run("returns false for token with invalid expiry format", func(t *testing.T) {
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": "1234567890",
			"exp": "invalid",
			"iat": time.Now().Unix(),
		})

		tokenString, err := token.SignedString(secretKey)
		require.NoError(t, err)

		result := humio.IsExpired(tokenString)
		require.False(t, result)
	})
}
