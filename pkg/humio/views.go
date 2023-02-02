package humio

func (qr *QueryRunner) GetAllViews() ([]string, error) {
	client := qr.client
	return client.ListViews()
}
