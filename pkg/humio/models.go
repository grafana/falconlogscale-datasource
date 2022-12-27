package humio

type Query struct {
	Repository     string `json:"repository"`
	LSQL           string `json:"lsql"`
	Start          string `json:"start,omitempty"`
	End            string `json:"end,omitempty"`
	Live           bool   `json:"isLive,omitempty"`
	TimezoneOffset *int   `json:"timeZoneOffsetMinutes,omitempty"`
}

type QueryResult struct {
	Cancelled bool             `json:"cancelled"`
	Done      bool             `json:"done"`
	Events    []map[string]any `json:"events"`
}
