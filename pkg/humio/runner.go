package humio

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

type QueryRunner struct {
	client Client
}

// QueryRunnerOption acts as an optional modifier on the QueryRunner
type QueryRunnerOption func(qr *QueryRunner)

func NewQueryRunner(c Client, opts ...QueryRunnerOption) *QueryRunner {
	qr := &QueryRunner{
		client: c,
	}

	for _, o := range opts {
		o(qr)
	}

	return qr
}

func (qj *QueryRunner) Run(query Query) ([]QueryResult, error) {
	client := qj.client
	repository := query.Repository
	// 	queryString := `#cid = "56879ccf959c4afc96dd17e8bb1dcbb5"
	// | ComputerName = * AND AgentIdString = "f5ea7013e8c24bceb5e9715f2cde8c0a" | "Event_DetectionSummaryEvent"
	// | top(Technique)` //qj.context.Model.Query
	// 	start := "10y" //qj.context.Query.TimeRange.From.String()
	// 	end := ""      //qj.context.Query.TimeRange.To.String()

	ctx := contextCancelledOnInterrupt(context.Background())
	// run in lambda func to be able to defer and delete the query job
	result, err := func() (*QueryResult, error) {
		id, err := client.CreateJob(repository, query)

		if err != nil {
			return nil, err
		}

		defer func(id string) {
			// Humio will eventually delete the query when we stop polling and we can't do much about errors here.
			_ = client.DeleteJob(repository, id)
		}(id)

		var result QueryResult
		poller := queryJobPoller{
			queryJobs:  &qj.client,
			repository: repository,
			id:         id,
		}
		result, err = poller.WaitAndPollContext(ctx)

		if err != nil {
			return nil, err
		}

		for !result.Done {
			result, err = poller.WaitAndPollContext(ctx)
			if err != nil {
				return nil, err
			}
		}

		return &result, nil
	}()

	if err != nil {
		return nil, err
	}

	if err != nil {
		log.DefaultLogger.Error("Humio query string error: %s\n", err.Error())
	}

	r := humioToDatasourceResult(*result)
	return []QueryResult{r}, nil
}

func humioToDatasourceResult(r QueryResult) QueryResult {
	return QueryResult{
		Cancelled: r.Cancelled,
		Done:      r.Done,
		Events:    r.Events,
	}
}

type queryJobPoller struct {
	queryJobs  *Client
	repository string
	id         string
	nextPoll   time.Time
}

func (q *queryJobPoller) WaitAndPollContext(ctx context.Context) (QueryResult, error) {
	select {
	case <-time.After(time.Until(q.nextPoll)):
	case <-ctx.Done():
		return QueryResult{}, ctx.Err()
	}

	result, err := q.queryJobs.PollJob(q.repository, q.id)
	if err != nil {
		return result, err
	}

	q.nextPoll = time.Now().Add(time.Duration(result.Metadata.PollAfter) * time.Millisecond)

	return result, err
}

func contextCancelledOnInterrupt(ctx context.Context) context.Context {
	ctx, cancel := context.WithCancel(ctx)

	sigC := make(chan os.Signal, 1)
	signal.Notify(sigC, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigC
		cancel()
	}()

	return ctx
}
