package server_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/emmanuelay/zwiki/nodes"
	"github.com/emmanuelay/zwiki/server"
)

func initApi() *server.Api {
	repo := nodes.NewFileSystemRepository("../tests/")
	api := server.NewApi(8080, repo)
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

	expectedBody := "This is index.md\n"
	if !strings.EqualFold(response.Data.Content, expectedBody) {
		t.Errorf("Expected '%s', got '%s'", expectedBody, response.Data.Content)
	}

	expectedStatus := "getNode"
	if !strings.EqualFold(response.Status, expectedStatus) {
		t.Errorf("Expected '%s', got '%s'", expectedStatus, response.Status)
	}
}
