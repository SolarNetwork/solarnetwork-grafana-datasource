package plugin

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// GetXSnDate formats the provided time value using the HTTP-date format expected
// by SolarNetwork (for example "Fri, 03 Mar 2017 04:36:28 GMT").
func GetXSnDate(t time.Time) string {
	return t.UTC().Format("Mon, 02 Jan 2006 15:04:05 GMT")
}

// hmacSHA256 returns the HMAC SHA-256 digest of content using secret as the key.
func hmacSHA256(secret, content []byte) []byte {
	d := hmac.New(sha256.New, secret)
	d.Write(content)
	return d.Sum(nil)
}

// GenerateSigningKey derives the signing key for a request using the token
// secret, the request time, and the literal request string (typically
// "snws2_request").
func GenerateSigningKey(secret string, t time.Time, request string) []byte {
	date := t.UTC().Format("20060102")
	innerSecret := []byte("SNWS2" + secret)

	inner := hmacSHA256(innerSecret, []byte(date))
	return hmacSHA256(inner, []byte(request))
}

// GenerateSigningKeyHex is a convenience wrapper around GenerateSigningKey that
// returns the key as a lower-case hex string.
func GenerateSigningKeyHex(secret string, t time.Time, request string) string {
	return hex.EncodeToString(GenerateSigningKey(secret, t, request))
}

// GenerateSigningMessage builds the signing message using the provided time
// value and canonical request string.
func GenerateSigningMessage(t time.Time, canonicalRequest string) string {
	digest := sha256.Sum256([]byte(canonicalRequest))
	return fmt.Sprintf(
		"SNWS2-HMAC-SHA256\n%s\n%x",
		t.UTC().Format("20060102T150405Z"),
		digest,
	)
}

// OrderQueryParameters sorts query parameters and encodes them per RFC 3986,
// returning a deterministic query string. The original ordering of duplicate
// keys is preserved.
func OrderQueryParameters(q string) string {
	if strings.TrimSpace(q) == "" {
		return ""
	}

	values, err := url.ParseQuery(q)
	if err != nil {
		// Best-effort handling: fall back to returning the original string when
		// parsing fails so callers can decide how to handle invalid input.
		return q
	}

	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	first := true
	for _, key := range keys {
		for _, val := range values[key] {
			if !first {
				b.WriteByte('&')
			} else {
				first = false
			}
			b.WriteString(url.QueryEscape(key))
			b.WriteByte('=')
			b.WriteString(url.QueryEscape(val))
		}
	}

	return b.String()
}

// GenerateCanonicalRequestMessage constructs the canonical request message used
// when computing the signing string.
func GenerateCanonicalRequestMessage(method, path, parameters string, signedHeaders map[string]string, body string) string {
	var b strings.Builder

	b.WriteString(strings.ToUpper(method))
	b.WriteByte('\n')
	b.WriteString(path)
	b.WriteByte('\n')
	b.WriteString(OrderQueryParameters(parameters))
	b.WriteByte('\n')

	keys := sortedLowerKeys(signedHeaders)
	for _, k := range keys {
		b.WriteString(k)
		b.WriteByte(':')
		b.WriteString(strings.TrimSpace(signedHeaders[k]))
		b.WriteByte('\n')
	}

	b.WriteString(strings.Join(keys, ";"))
	b.WriteByte('\n')

	digest := sha256.Sum256([]byte(body))
	b.WriteString(hex.EncodeToString(digest[:]))

	return b.String()
}

// GenerateSignature creates the hex-encoded HMAC SHA-256 signature for the
// provided message using the supplied key.
func GenerateSignature(message []byte, key []byte) string {
	return hex.EncodeToString(hmacSHA256(key, message))
}

// GenerateAuthHeader builds the full Authorization header value for a request.
func GenerateAuthHeader(token, secret, method, path, params string, signedHeaders map[string]string, body string, t time.Time) string {
	canonical := GenerateCanonicalRequestMessage(method, path, params, signedHeaders, body)
	key := GenerateSigningKey(secret, t, "snws2_request")
	msg := GenerateSigningMessage(t, canonical)
	sig := GenerateSignature([]byte(msg), key)

	headerNames := strings.Join(sortedLowerKeys(signedHeaders), ";")
	return fmt.Sprintf("SNWS2 Credential=%s,SignedHeaders=%s,Signature=%s", token, headerNames, sig)
}

func sortedLowerKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, strings.ToLower(strings.TrimSpace(k)))
	}
	sort.Strings(keys)
	return keys
}
