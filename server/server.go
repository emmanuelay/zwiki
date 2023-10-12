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
	"github.com/go-chi/chi"
	"github.com/go-chi/chi/middleware"
)

type Api struct {
	port int
	repo nodes.Repository
}

func NewApi(port int, repo nodes.Repository) *Api {
	return &Api{
		port: port,
		repo: repo,
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
		apiRouter.Get("/all", api.getAll)
		apiRouter.Get("/get", api.getNode)
		apiRouter.Put("/update", api.updateNode)
		apiRouter.Post("/create", api.createNode)
		apiRouter.Delete("/delete", api.deleteNode)
	})

	r.Handle("/*", fs)

	fmt.Printf("Listning on http://localhost:%d ... \n", api.port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", api.port), r); err != nil {
		log.Fatal(err)
	}
}

func (a *Api) getAll(w http.ResponseWriter, r *http.Request) {
	nodes, err := a.repo.GetAll(r.Context())
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "getAll failed")
		return
	}

	respondWithJSON(w, 200, nodes)
}

func (a *Api) getNode(w http.ResponseWriter, r *http.Request) {
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

func (a *Api) updateNode(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "updateNode"})
}

func (a *Api) createNode(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "createNode"})
}

func (a *Api) deleteNode(w http.ResponseWriter, r *http.Request) {
	respondWithJSON(w, http.StatusOK, map[string]string{"status": "deleteNode"})
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
