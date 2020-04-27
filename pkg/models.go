package main

import (
	"time"
)

type SigningKeyInfo struct {
	Key   string    `json:"key"`
	Date  time.Time `json:"date"`
}
