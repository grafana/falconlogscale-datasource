package humio

type Settings struct {
	BaseURL               string   `json:"baseURL"`
	AccessToken           string   `json:"accessToken,omitempty"`
	AuthenticateWithToken bool     `json:"authenticateWithToken,omitempty"`
	KeepCookies           []string `json:"keepCookies,omitempty"`
	//Timeout               uint     `json:"timeout,omitempty"`
	GraphqlEndpoint string
	RestEndpoint    string
	BasicAuthUser   string
	BasicAuthPass   string

	InsecureSkipVerify bool `json:"tlsSkipVerify,omitempty"`
	TlsClientAuth      bool `json:"tlsAuth,omitempty"`
	TlsAuthWithCACert  bool `json:"tlsAuthWithCACert,omitempty"`
	TlsCACert          string
	TlsClientCert      string
	TlsClientKey       string
	Secure             bool   `json:"secure,omitempty"`
	Timeout            string `json:"timeout,omitempty"`
	QueryTimeout       string `json:"queryTimeout,omitempty"`
	Protocol           string `json:"protocol"`
}
