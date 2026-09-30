package plugin

import (
	"testing"
	"time"
)

func TestGetXSnDate(t *testing.T) {
	ts := time.Date(2017, 3, 3, 4, 36, 28, 0, time.UTC)
	if got := GetXSnDate(ts); got != "Fri, 03 Mar 2017 04:36:28 GMT" {
		t.Fatalf("unexpected X-SN-Date: %s", got)
	}
}

func TestOrderQueryParameters(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{"empty", "", ""},
		{"sorted", "foo=1&bar=2&baz=3", "bar=2&baz=3&foo=1"},
		{"repeated", "foo=2&foo=1&bar=3", "bar=3&foo=2&foo=1"},
		{"escaped", "sourceId=/foo/bar", "sourceId=%2Ffoo%2Fbar"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := OrderQueryParameters(tc.input); got != tc.expected {
				t.Fatalf("expected %q, got %q", tc.expected, got)
			}
		})
	}
}

func TestGenerateSigningKey(t *testing.T) {
	ts := time.Date(2017, 1, 1, 0, 0, 0, 0, time.UTC)
	key := GenerateSigningKeyHex("ABC123", ts, "snws2_request")
	const expected = "1f96b28b651285e49d06989aebaee169fa67a5f6a07fb72a8325fce83b425ad6"
	if key != expected {
		t.Fatalf("expected signing key %s, got %s", expected, key)
	}
}

func TestGenerateCanonicalRequestMessage(t *testing.T) {
	headers := map[string]string{
		"host":      "data.solarnetwork.net",
		"x-sn-date": "Fri, 03 Mar 2017 04:36:28 GMT",
	}
	got := GenerateCanonicalRequestMessage(
		"GET",
		"/solarquery/api/v1/sec/datum/meta/50",
		"sourceId=Foo",
		headers,
		"",
	)

	const expected = `GET
/solarquery/api/v1/sec/datum/meta/50
sourceId=Foo
host:data.solarnetwork.net
x-sn-date:Fri, 03 Mar 2017 04:36:28 GMT
host;x-sn-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

	if got != expected {
		t.Fatalf("canonical request mismatch\nexpected:\n%s\n\ngot:\n%s", expected, got)
	}
}

func TestGenerateSigningMessage(t *testing.T) {
	ts := time.Date(2017, 3, 3, 4, 36, 28, 0, time.UTC)
	canonical := `GET
/solarquery/api/v1/sec/datum/meta/50
sourceId=Foo
host:data.solarnetwork.net
x-sn-date:Fri, 03 Mar 2017 04:36:28 GMT
host;x-sn-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

	got := GenerateSigningMessage(ts, canonical)
	const expected = `SNWS2-HMAC-SHA256
20170303T043628Z
8f732085380ed6dc18d8556a96c58c820b0148852a61b3c828cb9cfd233ae05f`

	if got != expected {
		t.Fatalf("unexpected signing message:\n%s", got)
	}
}

func TestGenerateSignature(t *testing.T) {
	ts := time.Date(2017, 3, 3, 4, 36, 28, 0, time.UTC)
	canonical := `GET
/solarquery/api/v1/sec/datum/meta/50
sourceId=Foo
host:data.solarnetwork.net
x-sn-date:Fri, 03 Mar 2017 04:36:28 GMT
host;x-sn-date
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`

	signingKey := GenerateSigningKey("ABC123", ts, "snws2_request")
	msg := GenerateSigningMessage(ts, canonical)
	sig := GenerateSignature([]byte(msg), signingKey)

	const expected = "bdab8efeb14032700de12cd2899fcfaf4e8e45c4935936338b9e108fb7ea613e"
	if sig != expected {
		t.Fatalf("expected signature %s, got %s", expected, sig)
	}
}

func TestGenerateAuthHeader(t *testing.T) {
	ts := time.Date(2017, 3, 3, 4, 36, 28, 0, time.UTC)
	headers := map[string]string{
		"host":      "data.solarnetwork.net",
		"x-sn-date": "Fri, 03 Mar 2017 04:36:28 GMT",
	}
	auth := GenerateAuthHeader(
		"test-token",
		"ABC123",
		"GET",
		"/solarquery/api/v1/sec/datum/meta/50",
		"sourceId=Foo",
		headers,
		"",
		ts,
	)

	const expected = "SNWS2 Credential=test-token,SignedHeaders=host;x-sn-date,Signature=bdab8efeb14032700de12cd2899fcfaf4e8e45c4935936338b9e108fb7ea613e"
	if auth != expected {
		t.Fatalf("unexpected auth header: %s", auth)
	}
}
