package models

import (
	"strings"
)

type Node struct {
	// ID is used to uniquely point to a specific node
	ID string `json:"id"`

	// Slug is used for navigation purposes
	Slug string `json:"-"`

	// Title is used for visual representation
	Title string `json:"title"`

	// Meta contains frontmatter data
	Meta map[string]string `json:"meta"`

	// Content is the markdown content of a node
	Content string `json:"content"`

	// ModTime holds the last modification timestamp
	ModTime int64 `json:"-"`
}

func Slug(input string) string {
	input = strings.ToLower(input)
	input = strings.TrimRight(input, " ")
	input = strings.TrimLeft(input, " ")

	replacements := map[string]string{
		"å":      "a",
		"ä":      "a",
		"ö":      "o",
		".":      "-",
		",":      "",
		"!":      "",
		"?":      "",
		"#":      "",
		"%":      "",
		"(":      "",
		")":      "",
		"\u0026": "and",
		" ":      "-",
		"-_-":    "-",
		"--":     "-",
	}

	for term := range replacements {
		input = strings.ReplaceAll(input, term, replacements[term])
	}

	return input
}
