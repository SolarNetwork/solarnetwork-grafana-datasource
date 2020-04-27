package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/grafana/grafana-plugin-model/go/datasource"
	plugin "github.com/hashicorp/go-plugin"
)

const SecretPrefix = "SNWS2"
const DateFormat = "20060102"
const HashData = "snws2_request"
const RefId = "sk"

type SolarNetworkDatasource struct {
	plugin.NetRPCUnsupportedPlugin
}

func (ds *SolarNetworkDatasource) Query(ctx context.Context, tsdbReq *datasource.DatasourceRequest) (*datasource.DatasourceResponse, error) {
	var results []*datasource.QueryResult

	t := time.Now().UTC()
	secret := tsdbReq.Datasource.DecryptedSecureJsonData["secret"]
	h := hmac.New(sha256.New, []byte(SecretPrefix + secret))
	h.Write([]byte(t.Format(DateFormat)))
	h2 := hmac.New(sha256.New, h.Sum(nil))
	h2.Write([]byte(HashData))
	key := hex.EncodeToString(h2.Sum(nil))
	info := &SigningKeyInfo {
		Key: key,
		Date: t,
	}

	var meta, err = json.Marshal(info)
	if err != nil {
		return &datasource.DatasourceResponse{}, err
	}

	results = append(results, &datasource.QueryResult{
		RefId: RefId,
		MetaJson: string(meta),
	})

	return &datasource.DatasourceResponse{
		Results: results,
	}, nil
}
