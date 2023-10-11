package server

import (
	"encoding/json"
	"fmt"
	"net/http"

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
	r.Get("/all", api.getAll)
	r.Handle("/*", fs)
	http.ListenAndServe(fmt.Sprintf(":%d", api.port), r)
}

func (a *Api) getAll(w http.ResponseWriter, r *http.Request) {
	nodes, err := a.repo.GetAll(r.Context())
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("getAll failed"))
		return
	}

	content, err := json.Marshal(nodes)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("getAll json marshalling failed"))
		return
	}

	w.Write([]byte(string(content)))
}

func (a *Api) getNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("getNode"))
}

func (a *Api) updateNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("updateNode"))
}

func (a *Api) createNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("createNode"))
}

func (a *Api) deleteNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("deleteNode"))
}
