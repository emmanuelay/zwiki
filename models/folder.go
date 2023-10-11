package models

type Folder struct {
	ID      string   `json:"id"`
	Folders []Folder `json:"folders"`
	Nodes   []Node   `json:"nodes"`
}

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
		if sub.ID == trail[0] {
			return sub.FindFolder(trail[1:])
		}
	}

	// No folder found, create it
	newSubFolder := Folder{ID: trail[0], Folders: []Folder{}}
	f.Folders = append(f.Folders, newSubFolder)

	return f.FindFolder(trail)
}
