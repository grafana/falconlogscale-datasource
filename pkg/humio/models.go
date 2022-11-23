package humio

type Query struct {
	Repository     string `json:"repository"`
	QueryString    string `json:"queryString"`
	Start          string `json:"start,omitempty"`
	End            string `json:"end,omitempty"`
	Live           bool   `json:"isLive,omitempty"`
	TimezoneOffset *int   `json:"timeZoneOffsetMinutes,omitempty"`
}

type QueryResult struct {
	Cancelled bool                     `json:"cancelled"`
	Done      bool                     `json:"done"`
	Events    []map[string]interface{} `json:"events"`
}

// QueryRequest encapsulates the data needed for the query runner to make a request
type QueryRequest struct {
	DatasetSlug string `json:"dataset"`
	Query       Query  `json:"query"`
}
