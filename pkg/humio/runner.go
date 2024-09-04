package humio

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"
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
	ctx := contextCancelledOnInterrupt(context.Background())

	c := make(chan QueryResult)
	go qj.GetChannel(ctx, query, &c)
	// if err != nil {
	// 	log.DefaultLogger.Error("Humio query string error: %s\n", err.Error())
	// 	return nil, err
	// }
	//	c <- j
	for j := range c {
		if j.Done {
			r := humioToDatasourceResult(j)
			close(c)
			return []QueryResult{r}, nil
		}
	}
	return []QueryResult{}, nil
}

func (qr *QueryRunner) GetChannel(ctx context.Context, query Query, c *chan QueryResult) (err error) {
	repository := query.Repository

	id, err := qr.jobQuerier.CreateJob(repository, query)

	if err != nil {
		return
	}

	defer func(id string) {
		// Humio will eventually delete the query when we stop polling and we can't do much about errors here.
		_ = qr.jobQuerier.DeleteJob(repository, id)
	}(id)

	var result QueryResult
	poller := QueryJobPoller{
		QueryJobs:  &qr.jobQuerier,
		Repository: repository,
		Id:         id,
	}
	result, err = poller.WaitAndPollContext(ctx)
	for !result.Done {
		result, err = poller.WaitAndPollContext(ctx)
		if err != nil {
			return
		}
		*c <- result
	}
	*c <- result
	return
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
