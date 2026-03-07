package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/emmanuelay/zwiki/nodes"
	"github.com/emmanuelay/zwiki/search"
	"github.com/emmanuelay/zwiki/server"
)

func initApi() *server.Api {
	repo := nodes.NewFileSystemRepository("../tests/")
	searchIndex, _ := search.NewIndex()
	api := server.NewApi(8080, repo, searchIndex)
	return api
}

func TestGetAll(t *testing.T) {
	api := initApi()
	req, err := http.NewRequest("GET", "/api/all", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(api.GetAll)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}
}

func TestGetNode(t *testing.T) {
	api := initApi()
	req, err := http.NewRequest("GET", "/api/get?node=/index.md", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(api.GetNode)
	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	var response struct {
		Data struct {
			Id      string `json:"id"`
			Path    string `json:"path"`
			Title   string `json:"title"`
			Content string `json:"content"`
		} `json:"data"`
		Status string `json:"status"`
	}

	decoder := json.NewDecoder(rr.Body)
	if err := decoder.Decode(&response); err != nil {
		t.Fatal(err)
	}

	expectedBody := "# Welcome to the Wiki\n\nThis is the main entry point. From here you can navigate to different topics using the sidebar.\n\n## Getting Started\n\n- Browse the table of contents on the left\n- Click on any note to view its content\n- Use the edit button to make changes\n\n## Quick Links\n\n- Check out the [[todo]] for what's next\n- Browse [[Code Snippets]] for useful examples\n- Read about [[Go Patterns]] for architecture guidance"
	if !strings.EqualFold(response.Data.Content, expectedBody) {
		t.Errorf("Expected '%s', got '%s'", expectedBody, response.Data.Content)
	}

	expectedStatus := "getNode"
	if !strings.EqualFold(response.Status, expectedStatus) {
		t.Errorf("Expected '%s', got '%s'", expectedStatus, response.Status)
	}
}
