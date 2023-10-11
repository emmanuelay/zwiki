package models_test

import (
	"testing"

	"github.com/emmanuelay/zwiki/models"
)

func TestSlug(t *testing.T) {
	tt := map[string]string{
		"Hello World":                  "hello-world",
		"Something, fishy":             "something-fishy",
		"Best practices ":              "best-practices",
		" Things to read ":             "things-to-read",
		"something,  weird, going on!": "something-weird-going-on",
	}

	for term := range tt {
		output := models.Slug(term)
		if output != tt[term] {
			t.Errorf("expected '%s', got '%s'", tt[term], output)
		}
	}
}
