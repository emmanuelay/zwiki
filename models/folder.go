package models

import (
	"fmt"
)

type Folder struct {
	ID      string   `json:"id"`
	Name    string   `json:"name"`
	Folders []Folder `json:"folders"`
	Nodes   []Node   `json:"nodes"`
}

var entryCount int64

// FindFolder expects a trail to a nested folder in the form of a string slice
// eg. [root, second level, third level, fourth level]
func (f *Folder) FindFolder(trail []string) *Folder {
	if len(trail) == 0 {
		return f
	}

	// Skip zero-length trail
	if len(trail[0]) == 0 {
		return f.FindFolder(trail[1:])
	}

	for idx := range f.Folders {
		sub := &f.Folders[idx]
		if sub.Name == trail[0] {
			return sub.FindFolder(trail[1:])
		}
	}

	// No folder found, create it
	entryCount++
	newSubFolder := Folder{ID: fmt.Sprintf("%d", entryCount), Name: trail[0], Folders: []Folder{}}
	f.Folders = append(f.Folders, newSubFolder)

	return f.FindFolder(trail)
}
