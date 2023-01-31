package humio

func (qr *QueryRunner) GetAllViews() ([]string, error) {
	client := qr.client
	results, err := client.Views().List()
	if err != nil {
		return []string{}, err
	}
	var r []string
	for _, val := range results {
		r = append(r, val.Name)
	}
	return r, nil
}
