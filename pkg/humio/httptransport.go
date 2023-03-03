package humio

import "net/http"

type HttpHeaderTransport struct {
	rt      http.RoundTripper
	headers map[string]string
}

func (t *HttpHeaderTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	for key, val := range t.headers {
		req.Header.Set(key, val)
	}
	return t.rt.RoundTrip(req)
}
