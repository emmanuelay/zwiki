package server

import (
	"fmt"
	"net/http"

	"github.com/emmanuelay/zwiki/nodes"
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
	fmt.Println("api:serve")

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Get("/all", api.getAll)
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("welcome"))
	})
	http.ListenAndServe(fmt.Sprintf(":%d", api.port), r)
}

func (api *Api) getAll(w http.ResponseWriter, r *http.Request) {
	nodes, err := api.repo.getAll()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("getAll failed"))
		return
	}

	w.Write([]byte("getAll"))
	w.Write(nodes)
}

func (api *Api) getNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("getNode"))
}

func (api *Api) updateNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("updateNode"))
}

func (api *Api) createNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("createNode"))
}

func (api *Api) deleteNode(w http.ResponseWriter, r *http.Request) {
	w.Write([]byte("deleteNode"))
}
