package humio

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/experimental/errorsource"
)

type JobQuerier interface {
	CreateJob(repo string, query Query) (string, error)
	DeleteJob(repo string, id string) error
	PollJob(repo string, id string) (QueryResult, error)
	ListRepos() ([]string, error)
	SetAuthHeaders(headers map[string]string)
}

type QueryRunner struct {
	jobQuerier JobQuerier
}

// QueryRunnerOption acts as an optional modifier on the QueryRunner
type QueryRunnerOption func(qr *QueryRunner)

func NewQueryRunner(c JobQuerier, opts ...QueryRunnerOption) *QueryRunner {
	qr := &QueryRunner{
		jobQuerier: c,
	}

	for _, o := range opts {
		o(qr)
	}

	return qr
}

func (qj *QueryRunner) Run(query Query) ([]QueryResult, error) {
	repository := query.Repository

	ctx := contextCancelledOnInterrupt(context.Background())
	// run in lambda func to be able to defer and delete the query job
	result, err := func() (*QueryResult, error) {
		id, err := qj.jobQuerier.CreateJob(repository, query)

		if err != nil {
			return nil, err
		}

		defer func(id string) {
			// Humio will eventually delete the query when we stop polling and we can't do much about errors here.
			_ = qj.jobQuerier.DeleteJob(repository, id)
		}(id)

		var result QueryResult
		poller := queryJobPoller{
			queryJobs:  &qj.jobQuerier,
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
		return nil, errorsource.DownstreamError(err, false)
	}

	if err != nil {
		log.DefaultLogger.Error("Humio query string error: %s\n", err.Error())
	}

	r := humioToDatasourceResult(*result)
	return []QueryResult{r}, nil
}

func (qr *QueryRunner) GetAllRepoNames() ([]string, error) {
	return qr.jobQuerier.ListRepos()
}

func (qr *QueryRunner) SetAuthHeaders(authHeaders map[string]string) {
	qr.jobQuerier.SetAuthHeaders(authHeaders)
}

func humioToDatasourceResult(r QueryResult) QueryResult {
	return QueryResult{
		Cancelled: r.Cancelled,
		Done:      r.Done,
		Events:    r.Events,
	}
}

type queryJobPoller struct {
	queryJobs  *JobQuerier
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

	result, err := (*q.queryJobs).PollJob(q.repository, q.id)
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
