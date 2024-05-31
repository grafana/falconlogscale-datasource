package humio

type RepoVariableResponse struct {
	Name  string
	Value string
}

func ConvertRepos(repos []string) []RepoVariableResponse {
	reposMapped := []RepoVariableResponse{}
	if len(repos) > 0 {
		for _, r := range repos {
			reposMapped = append(reposMapped, RepoVariableResponse{
				Name:  r,
				Value: r,
			})
		}
	}

	return reposMapped
}
