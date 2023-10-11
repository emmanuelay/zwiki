package models_test

import (
	"os"
	"strings"
	"testing"

	"github.com/emmanuelay/zwiki/models"
)

func TestFolder(t *testing.T) {
	root := &models.Folder{ID: "root", Folders: []models.Folder{}}
	trail := strings.Split("/hello/world/domination", string(os.PathSeparator))

	endFolder := root.FindFolder(trail)

	if endFolder.ID != trail[len(trail)-1] {
		t.Errorf("expected '%s' got '%s", trail[len(trail)-1], endFolder.ID)
	}

	if root.Folders[0].ID != "hello" {
		t.Fail()
	}

	if root.Folders[0].Folders[0].ID != "world" {
		t.Fail()
	}

	if root.Folders[0].Folders[0].Folders[0].ID != "domination" {
		t.Fail()
	}
}
