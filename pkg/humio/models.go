package humio

type Query struct {
	Repository     string `json:"repository"`
	LSQL           string `json:"lsql"`
	Start          string `json:"start,omitempty"`
	End            string `json:"end,omitempty"`
	Live           bool   `json:"isLive,omitempty"`
	TimezoneOffset *int   `json:"timeZoneOffsetMinutes,omitempty"`
	FormatAs       string `json:"formatAs"`
	QueryType      string `json:"queryType,omitempty"`

	// This is the version of the plugin that the query was created/updated with
	// Needed for tracking query versions across migrations
	Version string `json:"version,omitempty"`
}

const (
	QueryTypeLQL          = "LQL"
	QueryTypeRepositories = "Repositories"
)

const (
	FormatMetrics = "metrics"
	FormatLogs    = "logs"
)

type QueryResult struct {
	Cancelled bool                `json:"cancelled"`
	Done      bool                `json:"done"`
	Events    []map[string]any    `json:"events"`
	Metadata  QueryResultMetadata `json:"metaData"`
}

type QueryResultMetadata struct {
	EventCount       uint64                 `json:"eventCount"`
	ExtraData        map[string]interface{} `json:"extraData"`
	FieldOrder       []string               `json:"fieldOrder"`
	IsAggregate      bool                   `json:"isAggregate"`
	PollAfter        int                    `json:"pollAfter"`
	ProcessedBytes   uint64                 `json:"processedBytes"`
	ProcessedEvents  uint64                 `json:"processedEvents"`
	QueryStart       uint64                 `json:"queryStart"`
	QueryEnd         uint64                 `json:"queryEnd"`
	ResultBufferSize uint64                 `json:"resultBufferSize"`
	TimeMillis       uint64                 `json:"timeMillis"`
	TotalWork        uint64                 `json:"totalWork"`
	WorkDone         uint64                 `json:"workDone"`
}
