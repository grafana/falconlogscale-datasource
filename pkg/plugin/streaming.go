package plugin

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/grafana/falconlogscale-datasource-backend/pkg/humio"
	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/data"
	"github.com/grafana/grafana-plugin-sdk-go/data/framestruct"
)

func (h *Handler) SubscribeStream(ctx context.Context, req *backend.SubscribeStreamRequest) (*backend.SubscribeStreamResponse, error) {
	// Expect tail/${key}
	if !strings.HasPrefix(req.Path, "tail/") {
		return &backend.SubscribeStreamResponse{
			Status: backend.SubscribeStreamStatusNotFound,
		}, fmt.Errorf("expected tail in channel path")
	}

	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return nil, err
	}

	//todo: dont run an invalid query and return an error

	h.streamsMu.RLock()
	defer h.streamsMu.RUnlock()

	cache, ok := h.streams[req.Path]
	if ok {
		msg, err := backend.NewInitialData(cache.Bytes(data.IncludeAll))
		return &backend.SubscribeStreamResponse{
			Status:      backend.SubscribeStreamStatusOK,
			InitialData: msg,
		}, err
	}

	// nothing yet
	return &backend.SubscribeStreamResponse{
		Status: backend.SubscribeStreamStatusOK,
	}, nil
}

func (h *Handler) PublishStream(context.Context, *backend.PublishStreamRequest) (*backend.PublishStreamResponse, error) {
	return &backend.PublishStreamResponse{
		Status: backend.PublishStreamStatusPermissionDenied,
	}, nil
}

func (h *Handler) RunStream(ctx context.Context, req *backend.RunStreamRequest, sender *backend.StreamSender) error {
	//logger := s.logger.FromContext(ctx)
	var qr humio.Query
	if err := json.Unmarshal(req.Data, &qr); err != nil {
		return err
	}
	err := ValidateQuery(qr)
	if err != nil {
		return err
	}
	qr.Start = "1m"
	c := make(chan humio.StreamingResults)
	prev := data.FrameJSONCache{}
	done := make(chan any)
	defer close(done)

	h.QueryRunner.RunChannel(ctx, qr, c, done)

	for r := range c {
		if len(r) == 0 {
			continue
		}

		// f, err := h.FrameMarshaller("events", r, asdf(r)...)
		// if err != nil {
		// 	//logger.Error("Websocket write:", "err", err, "raw", message)
		// 	return err
		// }

		f := data.NewFrame(
			"events",
			data.NewField("field", nil, []string{}),
		)
		f.AppendRow(
			fmt.Sprint(r),
		)

		// r := rand.New(rand.NewSource(99))
		// p1 := float64(4)
		// p2 := time.Now().UnixMilli()
		// f :=
		// 	data.NewFrame("test",
		// 		data.NewField("time", nil, []time.Time{time.Unix(1, 0)}),
		// 		data.NewField("test-value1", nil, []*float64{&p1}),
		// 		data.NewField("test-value2", nil, []*int64{&p2}))

		//PrependTimestampField(f)
		if f != nil {
			next, _ := data.FrameToJSONCache(f)
			if next.SameSchema(&prev) {
				err = sender.SendFrame(f, data.IncludeDataOnly)
			} else {
				err = sender.SendFrame(f, data.IncludeAll)
			}
			if err != nil {
				//logger.Error("Websocket write:", "err", err, "raw", message)
				//return
			}
			prev = next

			// Cache the initial data
			h.streamsMu.Lock()
			h.streams[req.Path] = prev
			h.streamsMu.Unlock()
		}
	}
	//c <- humio.QueryResult{}
	return nil
}

func frameToString(input any) (any, error) {
	var b []byte
	if s, ok := input.(string); ok {
		b = []byte(s)
	} else if data, ok := input.([]byte); ok {
		b = data
	} else {
		return nil, fmt.Errorf("input is not a string or []byte")
	}
	var s string
	json.Unmarshal(b, &s)
	return s, nil
}

func asdf(event humio.StreamingResults) []framestruct.FramestructOption {
	sm := sync.RWMutex{}
	sm.Lock()
	var converters []framestruct.FramestructOption
	// search through all event fields and return every field name with a value
	for key := range event {
		converters = append(converters, framestruct.WithConverterFor(key, frameToString))
	}
	sm.Unlock()
	return converters
}

//category="Request" severity="Info" @timestamp="1727212104907" message="" orgId="I1ojRsmWuJJ4WnmXkaW0Fc9BCHgyHrIe" route="humio" method="DELETE" remote="99.105.226.205" uri="http://cloud.community.humio.com/api/v1/repositories/humio-organization-github-demo/queryjobs/P4-EAqiM2oxcm8WBtpwziy3Neyh" time="4" userAgent="Go-http-client/1.1" userID="gNYvfNp5MEXp3jupZiJIylBP" user="andrew.hackmann@grafana.com" organisationId="I1ojRsmWuJJ4WnmXkaW0Fc9BCHgyHrIe" organisationName="Grafana" status="204" internal="false" contentLength="0" decodedContentLength="0" responseLength="0"
//{ "actor": { "display_login": "jonmeow", "avatar_url": "https://avatars.githubusercontent.com/u/46229924?", "id": 46229924, "login": "jonmeow", "gravatar_id": "", "url": "https://api.github.com/users/jonmeow" }, "public": true, "org": { "avatar_url": "https://avatars.githubusercontent.com/u/63681715?", "id": 63681715, "login": "carbon-language", "gravatar_id": "", "url": "https://api.github.com/orgs/carbon-language" }, "payload": { "pull_request": { "issue_url": "https://api.github.com/repos/carbon-language/carbon-lang/issues/4329", "_links": { "comments": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/issues/4329/comments"}, "issue": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/issues/4329"}, "self": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329"}, "review_comments": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329/comments"}, "commits": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329/commits"}, "statuses": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/statuses/6bf626218483074ea905efe39b4aabf5094a7ed9"}, "html": {"href": "https://github.com/carbon-language/carbon-lang/pull/4329"}, "review_comment": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/comments{/number}"} }, "diff_url": "https://github.com/carbon-language/carbon-lang/pull/4329.diff", "created_at": "2024-09-19T23:37:07Z", "title": "`where` check stage, step 1: designators", "body": "Right now, there is no checking of `where` requirements. The result of a where expression is just th", "author_association": "CONTRIBUTOR", "number": 4329, "patch_url": "https://github.com/carbon-language/carbon-lang/pull/4329.patch", "updated_at": "2024-09-24T21:04:31Z", "draft": false, "merge_commit_sha": "3e4f2c3a7c564160277d0ff82587794e3c49e829", "comments_url": "https://api.github.com/repos/carbon-language/carbon-lang/issues/4329/comments", "review_comment_url": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/comments{/number}", "active_lock_reason": null, "id": 2082060236, "state": "open", "locked": false, "commits_url": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329/commits", "closed_at": null, "statuses_url": "https://api.github.com/repos/carbon-language/carbon-lang/statuses/6bf626218483074ea905efe39b4aabf5094a7ed9", "merged_at": null, "auto_merge": null, "url": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329", "milestone": null, "html_url": "https://github.com/carbon-language/carbon-lang/pull/4329", "review_comments_url": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329/comments", "assignee": null, "user": { "gists_url": "https://api.github.com/users/josh11b/gists{/gist_id}", "repos_url": "https://api.github.com/users/josh11b/repos", "following_url": "https://api.github.com/users/josh11b/following{/other_user}", "starred_url": "https://api.github.com/users/josh11b/starred{/owner}{/repo}", "login": "josh11b", "followers_url": "https://api.github.com/users/josh11b/followers", "type": "User", "url": "https://api.github.com/users/josh11b", "subscriptions_url": "https://api.github.com/users/josh11b/subscriptions", "received_events_url": "https://api.github.com/users/josh11b/received_events", "avatar_url": "https://avatars.githubusercontent.com/u/15258583?v=4", "events_url": "https://api.github.com/users/josh11b/events{/privacy}", "html_url": "https://github.com/josh11b", "site_admin": false, "id": 15258583, "gravatar_id": "", "node_id": "MDQ6VXNlcjE1MjU4NTgz", "organizations_url": "https://api.github.com/users/josh11b/orgs" }, "node_id": "PR_kwDOD3caBc58GbfM" }, "review": { "author_association": "CONTRIBUTOR", "submitted_at": "2024-09-24T21:04:31Z", "_links": { "pull_request": {"href": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329"}, "html": {"href": "https://github.com/carbon-language/carbon-lang/pull/4329#pullrequestreview-2326433793"} }, "html_url": "https://github.com/carbon-language/carbon-lang/pull/4329#pullrequestreview-2326433793", "id": 2326433793, "state": "commented", "pull_request_url": "https://api.github.com/repos/carbon-language/carbon-lang/pulls/4329", "body": "Looks good, just a question about the diagnostic format.", "user": { "gists_url": "https://api.github.com/users/jonmeow/gists{/gist_id}", "repos_url": "https://api.github.com/users/jonmeow/repos", "following_url": "https://api.github.com/users/jonmeow/following{/other_user}", "starred_url": "https://api.github.com/users/jonmeow/starred{/owner}{/repo}", "login": "jonmeow", "followers_url": "https://api.github.com/users/jonmeow/followers", "type": "User", "url": "https://api.github.com/users/jonmeow", "subscriptions_url": "https://api.github.com/users/jonmeow/subscriptions", "received_events_url": "https://api.github.com/users/jonmeow/received_events", "avatar_url": "https://avatars.githubusercontent.com/u/46229924?v=4", "events_url": "https://api.github.com/users/jonmeow/events{/privacy}", "html_url": "https://github.com/jonmeow", "site_admin": false, "id": 46229924, "gravatar_id": "", "node_id": "MDQ6VXNlcjQ2MjI5OTI0", "organizations_url": "https://api.github.com/users/jonmeow/orgs" }, "commit_id": "6bf626218483074ea905efe39b4aabf5094a7ed9", "node_id": "PRR_kwDOD3caBc6KqpAB" }, "action": "created" }, "repo": { "name": "carbon-language/carbon-lang", "id": 259463685, "url": "https://api.github.com/repos/carbon-language/carbon-lang" }, "created_at": "2024-09-24T21:04:32Z", "id": "42233972694", "type": "PullRequestReviewEvent", "timestamp": 1727212172000 }
