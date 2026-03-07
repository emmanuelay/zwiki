package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/emmanuelay/zwiki/nodes"
	assets "github.com/emmanuelay/zwiki/public"
	"github.com/emmanuelay/zwiki/search"
	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
)

type Api struct {
	port   int
	repo   nodes.Repository
	search *search.Index
}

func NewApi(port int, repo nodes.Repository, searchIndex *search.Index) *Api {
	return &Api{
		port:   port,
		repo:   repo,
		search: searchIndex,
	}
}

func (api *Api) Serve() {
	var staticFS = http.FS(assets.Public)
	fs := http.FileServer(staticFS)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))

	r.Route("/api", func(apiRouter chi.Router) {
		apiRouter.Get("/all", api.GetAll)
		apiRouter.Get("/get", api.GetNode)
		apiRouter.Put("/update", api.UpdateNode)
		apiRouter.Post("/create", api.CreateNode)
		apiRouter.Delete("/delete", api.DeleteNode)
		apiRouter.Get("/search", api.Search)
	})

	r.Handle("/*", fs)

	fmt.Printf("Listning on http://localhost:%d ... \n", api.port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", api.port), r); err != nil {
		log.Fatal(err)
	}
}

func (a *Api) GetAll(w http.ResponseWriter, r *http.Request) {
	nodes, err := a.repo.GetAll(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "getAll failed")
		return
	}

	respondWithJSON(w, 200, nodes)
}

func (a *Api) GetNode(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("node")
	slug = strings.TrimSpace(slug)

	if len(slug) == 0 {
		respondWithError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	node, err := a.repo.GetNode(r.Context(), slug)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, fmt.Sprintf("failed retrieving node '%v': %v", slug, err.Error()))
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"status": "getNode", "data": node})
}

func (a *Api) UpdateNode(w http.ResponseWriter, r *http.Request) {
	slug := r.URL.Query().Get("node")
	slug = strings.TrimSpace(slug)

	if len(slug) == 0 {
		respondWithError(w, http.StatusBadRequest, "invalid slug")
		return
	}

	var payload struct {
		Content string            `json:"content"`
		Meta    map[string]string `json:"meta"`
	}

	err := json.NewDecoder(r.Body).Decode(&payload)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid payload")
		return
	}

	node, err := a.repo.GetNode(r.Context(), slug)
	if err != nil {
		respondWithError(w, http.StatusBadRequest, fmt.Sprintf("failed retrieving node '%v': %v", slug, err.Error()))
		return
	}

	node.Content = payload.Content
	node.Meta = payload.Meta

	if err := a.repo.UpdateNode(r.Context(), slug, node); err != nil {
		respondWithError(w, http.StatusBadRequest, fmt.Sprintf("failed updating node '%v': %v", slug, err.Error()))
		return
	}

	a.search.IndexNode(node)

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"status": "updateNode", "data": node})
}

func (a *Api) CreateNode(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "createNode"})
}

func (a *Api) DeleteNode(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "deleteNode"})
}

func (a *Api) Search(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) == 0 {
		respondWithError(w, http.StatusBadRequest, "missing query parameter 'q'")
		return
	}

	results, err := a.search.Search(q, 20)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("search failed: %v", err))
		return
	}

	respondWithJSON(w, http.StatusOK, map[string]interface{}{"results": results})
}

func respondWithError(w http.ResponseWriter, code int, msg string) {
	respondWithJSON(w, code, map[string]string{"error": msg})
}

func respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	response, err := json.MarshalIndent(payload, "", "\t")
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(fmt.Sprintf("failed marshalling payload: %v", err.Error())))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	w.Write(response)
}
