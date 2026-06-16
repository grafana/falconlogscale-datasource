package humio

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
)

type JobQuerier interface {
	CreateJob(repo string, query Query) (string, error)
	DeleteJob(repo string, id string) error
	PollJob(repo string, id string) (QueryResult, error)
	ListRepos() ([]string, error)
	SetAuthHeaders(headers map[string]string) error
	Stream(ctx context.Context, method string, path string, query Query, ch chan StreamingResults) error
	OauthClientSecretHealthCheck() error
}

type QueryRunner struct {
	JobQuerier JobQuerier
}

// QueryRunnerOption acts as an optional modifier on the QueryRunner
type QueryRunnerOption func(qr *QueryRunner)

func NewQueryRunner(c JobQuerier, opts ...QueryRunnerOption) *QueryRunner {
	qr := &QueryRunner{
		JobQuerier: c,
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
		id, err := qj.JobQuerier.CreateJob(repository, query)

		if err != nil {
			return nil, err
		}

		defer func(id string) {
			// Humio will eventually delete the query when we stop polling and we can't do much about errors here.
			_ = qj.JobQuerier.DeleteJob(repository, id)
		}(id)

		var result QueryResult
		poller := QueryJobPoller{
			QueryJobs:  &qj.JobQuerier,
			Repository: repository,
			Id:         id,
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
		log.DefaultLogger.Error("Humio query string error: %s\n", err.Error())
		return nil, backend.DownstreamError(err)
	}

	r := humioToDatasourceResult(*result)
	return []QueryResult{r}, nil
}

func (qr *QueryRunner) RunChannel(ctx context.Context, query Query, c chan StreamingResults) {
	endPoint := fmt.Sprintf("api/v1/repositories/%s/query", query.Repository)
	go func() {
		err := qr.JobQuerier.Stream(ctx, http.MethodPost, endPoint, query, c)
		if err != nil {
			log.DefaultLogger.Error(err.Error())
			return
		}
	}()
}

func (qr *QueryRunner) GetAllRepoNames() ([]string, error) {
	return qr.JobQuerier.ListRepos()
}

func (qr *QueryRunner) SetAuthHeaders(authHeaders map[string]string) error {
	return qr.JobQuerier.SetAuthHeaders(authHeaders)
}

func (qr *QueryRunner) OauthClientSecretHealthCheck() error {
	return qr.JobQuerier.OauthClientSecretHealthCheck()
}

func humioToDatasourceResult(r QueryResult) QueryResult {
	return QueryResult{
		Cancelled: r.Cancelled,
		Done:      r.Done,
		Events:    r.Events,
	}
}

type QueryJobPoller struct {
	QueryJobs  *JobQuerier
	Repository string
	Id         string
	NextPoll   time.Time
}

func (q *QueryJobPoller) WaitAndPollContext(ctx context.Context) (QueryResult, error) {
	select {
	case <-time.After(time.Until(q.NextPoll)):
	case <-ctx.Done():
		return QueryResult{}, ctx.Err()
	}

	result, err := (*q.QueryJobs).PollJob(q.Repository, q.Id)
	if err != nil {
		return result, err
	}

	q.NextPoll = time.Now().Add(time.Duration(result.Metadata.PollAfter) * time.Millisecond)

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
